import type { BacktestResponse, PositionMode } from '@/types'
import { STRATEGIES } from './catalog'
import { getDataset } from './dataset-store'
import { EngineError, runEngine } from './engine'
import { loadYahooBars, type MarketBar } from './market-data'
import { calculateMetrics, MetricsError } from './metrics'
import {
  generateSignals,
  InsufficientHistoryError,
  StrategyError,
  type StrategyConfig,
} from './strategies'

export class BacktestValidationError extends Error {
  readonly fields: Record<string, string>

  constructor(message: string, fields: Record<string, string>) {
    super(message)
    this.name = 'BacktestValidationError'
    this.fields = fields
  }
}

export class BacktestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BacktestError'
  }
}

export interface BacktestInput {
  datasetId?: string
  symbol?: string
  start?: string
  end?: string
  positionMode: PositionMode
  alternateDatasetId?: string | null
  alternateSymbol?: string | null
  strategy: StrategyConfig
  initialCash: number
  commission: number
  slippageBps: number
}

function strategyWithDefaults(requestStrategy: StrategyConfig): StrategyConfig {
  const definition = STRATEGIES.find((s) => s.key === requestStrategy.key)
  if (!definition) {
    throw new BacktestValidationError('策略参数无效', { 'strategy.key': '不支持的策略' })
  }
  const defaults: Record<string, number> = {}
  for (const param of definition.parameters) {
    defaults[param.key] = param.default
  }
  const unknown = Object.keys(requestStrategy.params).filter((key) => !(key in defaults))
  if (unknown.length > 0) {
    const fields: Record<string, string> = {}
    for (const key of unknown.sort()) {
      fields[`strategy.params.${key}`] = '输入不合法'
    }
    throw new BacktestValidationError('策略参数无效', fields)
  }
  return {
    key: requestStrategy.key,
    params: { ...defaults, ...requestStrategy.params },
  }
}

export async function runBacktest(input: BacktestInput): Promise<BacktestResponse> {
  let bars: MarketBar[]
  let primarySymbol: string
  let resolvedDatasetId: string

  if (input.datasetId) {
    const primary = await getDataset(input.datasetId)
    bars = primary.bars
    primarySymbol = primary.metadata.symbol
    resolvedDatasetId = input.datasetId
  } else if (input.symbol && input.start && input.end) {
    primarySymbol = input.symbol.trim().toUpperCase()
    bars = await loadYahooBars(primarySymbol, input.start, input.end)
    resolvedDatasetId = `yahoo:${primarySymbol}:${bars[0].date}:${bars[bars.length - 1].date}`
  } else {
    throw new BacktestValidationError('请求参数无效', { datasetId: '请提供数据集或标的代码与日期范围' })
  }

  let alternateBars: MarketBar[] | null = null
  let alternateSymbol: string | null = null

  if (input.positionMode === 'rotate') {
    if (input.alternateDatasetId) {
      const alternate = await getDataset(input.alternateDatasetId)
      alternateBars = alternate.bars
      alternateSymbol = alternate.metadata.symbol
    } else if (input.alternateSymbol) {
      alternateSymbol = input.alternateSymbol.trim().toUpperCase()
      alternateBars = await loadYahooBars(
        alternateSymbol,
        bars[0].date,
        bars[bars.length - 1].date,
      )
    } else {
      throw new BacktestValidationError('换仓模式必须提供替代股票数据集', {
        alternateDatasetId: '换仓模式必须提供替代股票数据集',
      })
    }

    if (alternateSymbol === primarySymbol) {
      throw new BacktestValidationError('替代标的不能与主标的相同', {
        alternateDatasetId: '替代标的不能与主标的相同',
      })
    }

    const alternateMap = new Map(alternateBars.map((bar) => [bar.date, bar]))
    const alignedPrimary: MarketBar[] = []
    const alignedAlternate: MarketBar[] = []
    for (const bar of bars) {
      const alt = alternateMap.get(bar.date)
      if (alt) {
        alignedPrimary.push(bar)
        alignedAlternate.push(alt)
      }
    }
    if (alignedPrimary.length === 0) {
      throw new BacktestError('主标的和替代标的没有共同交易日')
    }
    bars = alignedPrimary
    alternateBars = alignedAlternate
  }

  let signals
  try {
    signals = generateSignals(bars, strategyWithDefaults(input.strategy))
  } catch (error) {
    if (error instanceof InsufficientHistoryError) {
      throw new BacktestError(error.message)
    }
    if (error instanceof StrategyError) {
      throw new BacktestValidationError(error.message, { strategy: error.message })
    }
    throw error
  }

  let engine
  let metrics
  try {
    engine = runEngine({
      bars,
      target: signals.target,
      initialCash: input.initialCash,
      commission: input.commission,
      slippageBps: input.slippageBps,
      primarySymbol,
      alternateBars,
      alternateSymbol,
    })
    metrics = calculateMetrics(
      engine.rows.map((row) => row.total),
      engine.trades,
      input.initialCash,
    )
  } catch (error) {
    if (error instanceof EngineError || error instanceof MetricsError) {
      throw new BacktestError(error.message)
    }
    throw error
  }

  return {
    metadata: {
      datasetId: resolvedDatasetId,
      strategyKey: input.strategy.key,
      start: bars[0].date,
      end: bars[bars.length - 1].date,
      execution: 'first_open_then_next_open',
      positionMode: input.positionMode,
      primarySymbol,
      alternateSymbol,
      warmup: signals.warmup,
      initialCash: input.initialCash,
      commission: input.commission,
      slippageBps: input.slippageBps,
    },
    metrics,
    series: {
      dates: bars.map((b) => b.date),
      open: bars.map((b) => b.open),
      high: bars.map((b) => b.high),
      low: bars.map((b) => b.low),
      close: bars.map((b) => b.close),
      cash: engine.rows.map((r) => r.cash),
      shares: engine.rows.map((r) => r.shares),
      holdings: engine.rows.map((r) => r.holdings),
      equity: engine.rows.map((r) => r.total),
      strategy: engine.rows.map((r) => r.strategy),
      benchmark: engine.rows.map((r) => r.benchmark),
      drawdown: engine.rows.map((r) => r.drawdown),
      benchmarkDrawdown: engine.rows.map((r) => r.benchmarkDrawdown),
      positionSymbol: engine.rows.map((r) => r.positionSymbol),
    },
    indicators: signals.indicators,
    fills: engine.fills,
    trades: engine.trades,
    warnings: engine.warnings,
  }
}
