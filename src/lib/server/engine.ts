import type { BacktestFill, BacktestTrade } from '@/types'
import type { MarketBar } from './market-data'

export class EngineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EngineError'
  }
}

export interface EngineRow {
  cash: number
  shares: number
  holdings: number
  total: number
  strategy: number
  benchmark: number
  drawdown: number
  benchmarkDrawdown: number
  positionSymbol: string | null
}

export interface EngineResult {
  rows: EngineRow[]
  fills: BacktestFill[]
  trades: BacktestTrade[]
  warnings: string[]
}

function checked(label: string, operation: () => number): number {
  const value = operation()
  if (!Number.isFinite(value)) {
    throw new EngineError(`${label}超出有限数值范围`)
  }
  return value
}

function zeroSmallResidue(value: number): number {
  return Math.abs(value) < 1e-12 ? 0.0 : value
}

function validateBars(bars: MarketBar[]): void {
  if (bars.length === 0) {
    throw new EngineError('行情数据不能为空')
  }
  for (const bar of bars) {
    if (!Number.isFinite(bar.open) || !Number.isFinite(bar.close) || bar.open <= 0 || bar.close <= 0) {
      throw new EngineError('开盘价和收盘价必须是有限正数')
    }
  }
}

export function runEngine(params: {
  bars: MarketBar[]
  target: Array<0 | 1>
  initialCash: number
  commission: number
  slippageBps: number
  primarySymbol?: string
  alternateBars?: MarketBar[] | null
  alternateSymbol?: string | null
}): EngineResult {
  const {
    bars,
    target,
    initialCash,
    commission,
    slippageBps,
    primarySymbol: rawPrimary = 'PRIMARY',
    alternateBars = null,
    alternateSymbol: rawAlternate = null,
  } = params

  validateBars(bars)
  if (target.length !== bars.length) {
    throw new EngineError('目标持仓必须与行情日期完全对齐')
  }
  if (!rawPrimary.trim()) {
    throw new EngineError('主标的代码不能为空')
  }
  if ((alternateBars === null) !== (rawAlternate === null)) {
    throw new EngineError('替代行情和替代标的代码必须同时提供')
  }
  const primarySymbol = rawPrimary.trim().toUpperCase()
  const alternateSymbol = rawAlternate ? rawAlternate.trim().toUpperCase() : null

  if (alternateBars !== null && alternateSymbol !== null) {
    validateBars(alternateBars)
    if (alternateBars.length !== bars.length || alternateBars.some((b, i) => b.date !== bars[i].date)) {
      throw new EngineError('替代行情必须与主行情日期完全对齐')
    }
    if (alternateSymbol === primarySymbol) {
      throw new EngineError('替代标的不能与主标的相同')
    }
  }
  if (!Number.isFinite(initialCash) || initialCash <= 0) {
    throw new EngineError('初始资金必须是有限正数')
  }
  if (!Number.isFinite(commission) || commission < 0) {
    throw new EngineError('佣金必须是有限非负数')
  }
  if (!Number.isFinite(slippageBps) || slippageBps < 0 || slippageBps >= 10_000) {
    throw new EngineError('滑点基点必须在 0（含）到 10000（不含）之间')
  }

  const slippageRate = slippageBps / 10_000
  const assetBars: Record<string, MarketBar[]> = { [primarySymbol]: bars }
  if (alternateBars !== null && alternateSymbol !== null) {
    assetBars[alternateSymbol] = alternateBars
  }

  let cash = initialCash
  let shares = 0
  let currentSymbol: string | null = null
  const fills: BacktestFill[] = []
  const trades: BacktestTrade[] = []
  const warnings: string[] = []
  let openEntry: BacktestFill | null = null

  let benchmarkCash = initialCash
  let benchmarkShares = 0
  const rawRows: Array<Omit<EngineRow, 'drawdown' | 'benchmarkDrawdown'>> = []
  let previousDesiredSymbol: string | null = null

  for (let offset = 0; offset < bars.length; offset++) {
    const primaryBar = bars[offset]
    const date = primaryBar.date
    const primaryOpen = primaryBar.open
    const primaryClose = primaryBar.close

    if (offset === 0) {
      benchmarkShares = Math.floor(checked('基准可购买股数', () => benchmarkCash / primaryOpen))
      const benchmarkNotional = checked('基准买入金额', () => benchmarkShares * primaryOpen)
      benchmarkCash = checked('基准剩余现金', () => benchmarkCash - benchmarkNotional)
    }

    const desiredSymbol: string | null =
      offset === 0 || target[offset - 1] === 1 ? primarySymbol : alternateSymbol

    if (currentSymbol !== desiredSymbol) {
      if (currentSymbol !== null && shares > 0) {
        const currentOpen = assetBars[currentSymbol][offset].open
        const fillPrice = checked('卖出成交价', () => currentOpen * (1 - slippageRate))
        const saleProceeds = checked('卖出所得', () => shares * fillPrice)
        const cashAndProceeds = checked('卖出可用资金', () => cash + saleProceeds)
        if (cashAndProceeds + 1e-12 < commission) {
          throw new EngineError('卖出所得和现金不足以支付佣金')
        }
        cash = zeroSmallResidue(checked('卖出后现金', () => cashAndProceeds - commission))
        const exitFill: BacktestFill = {
          date,
          symbol: currentSymbol,
          side: 'sell',
          price: fillPrice,
          shares,
          commission,
          notional: fillPrice * shares,
        }
        fills.push(exitFill)
        if (openEntry === null) {
          throw new Error('持仓缺少对应的买入成交')
        }
        const priceChange = checked('交易价差', () => fillPrice - openEntry!.price)
        const grossPnl = checked('交易毛收益', () => priceChange * shares)
        const costs = checked('交易成本', () => openEntry!.commission + commission)
        const netPnl = checked('交易净收益', () => grossPnl - costs)
        const entryNotional = checked('入场金额', () => openEntry!.price * openEntry!.shares)
        const entryCost = checked('入场总成本', () => entryNotional + openEntry!.commission)
        const returnPct = checked('交易收益率', () => netPnl / entryCost)
        trades.push({
          symbol: currentSymbol,
          entryDate: openEntry.date,
          entryPrice: openEntry.price,
          shares,
          exitDate: date,
          exitPrice: fillPrice,
          grossPnl,
          costs,
          netPnl,
          returnPct,
          isOpen: false,
        })
        shares = 0
        currentSymbol = null
        openEntry = null
      }

      const shouldAttemptBuy =
        desiredSymbol !== null &&
        currentSymbol === null &&
        (offset === 0 || desiredSymbol !== previousDesiredSymbol)

      if (shouldAttemptBuy) {
        const desiredOpen = assetBars[desiredSymbol][offset].open
        const fillPrice = checked('买入成交价', () => desiredOpen * (1 + slippageRate))
        const availableCash = checked('买入可用现金', () => cash - commission)
        let quantity = Math.floor(checked('策略可购买股数', () => availableCash / fillPrice))
        let buyNotional = quantity > 0 ? checked('买入金额', () => quantity * fillPrice) : 0.0
        let buyCost = checked('买入总成本', () => buyNotional + commission)
        while (quantity > 0 && buyCost > cash) {
          quantity -= 1
          buyNotional = checked('买入金额', () => quantity * fillPrice)
          buyCost = checked('买入总成本', () => buyNotional + commission)
        }
        if (quantity > 0) {
          cash = zeroSmallResidue(checked('买入后现金', () => cash - buyCost))
          shares = quantity
          currentSymbol = desiredSymbol
          openEntry = {
            date,
            symbol: desiredSymbol,
            side: 'buy',
            price: fillPrice,
            shares: quantity,
            commission,
            notional: fillPrice * quantity,
          }
          fills.push(openEntry)
        } else {
          warnings.push(`${date}：资金不足，无法买入 ${desiredSymbol}`)
        }
      }
    }

    const holdings =
      currentSymbol === null
        ? 0.0
        : checked('持仓市值', () => shares * assetBars[currentSymbol!][offset].close)
    const total = checked('总资产', () => cash + holdings)
    const benchmarkHoldings = checked('基准持仓市值', () => benchmarkShares * primaryClose)
    const benchmarkTotal = checked('基准总资产', () => benchmarkCash + benchmarkHoldings)

    rawRows.push({
      cash,
      shares,
      holdings,
      total,
      strategy: checked('策略净值', () => total / initialCash),
      benchmark: checked('基准净值', () => benchmarkTotal / initialCash),
      positionSymbol: currentSymbol,
    })
    previousDesiredSymbol = desiredSymbol
  }

  if (currentSymbol !== null && shares > 0) {
    if (openEntry === null) {
      throw new Error('持仓缺少对应的买入成交')
    }
    trades.push({
      symbol: currentSymbol,
      entryDate: openEntry.date,
      entryPrice: openEntry.price,
      shares,
      exitDate: null,
      exitPrice: null,
      grossPnl: null,
      costs: openEntry.commission,
      netPnl: null,
      returnPct: null,
      isOpen: true,
    })
  }

  let strategyPeak = -Infinity
  let benchmarkPeak = -Infinity
  const rows: EngineRow[] = rawRows.map((row) => {
    if (row.strategy > strategyPeak) strategyPeak = row.strategy
    if (row.benchmark > benchmarkPeak) benchmarkPeak = row.benchmark
    const drawdown = row.strategy / strategyPeak - 1
    const benchmarkDrawdown = row.benchmark / benchmarkPeak - 1
    if (!Number.isFinite(drawdown) || !Number.isFinite(benchmarkDrawdown)) {
      throw new EngineError('净值和回撤超出有限数值范围')
    }
    return {
      ...row,
      drawdown,
      benchmarkDrawdown,
    }
  })

  return { rows, fills, trades, warnings }
}
