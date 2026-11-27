import type { MarketBar } from './market-data'

export class StrategyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StrategyError'
  }
}

export class InsufficientHistoryError extends StrategyError {
  constructor(message: string) {
    super(message)
    this.name = 'InsufficientHistoryError'
  }
}

export interface StrategyOutput {
  target: Array<0 | 1>
  indicators: Record<string, Array<number | null>>
  warmup: number
}

export interface StrategyConfig {
  key: string
  params: Record<string, number>
}

function targetFromEvents(length: number, buy: boolean[], sell: boolean[]): Array<0 | 1> {
  const target: Array<0 | 1> = new Array(length)
  let position: 0 | 1 = 1
  for (let i = 0; i < length; i++) {
    if (buy[i]) {
      position = 1
    } else if (sell[i]) {
      position = 0
    }
    target[i] = position
  }
  return target
}

function integerParameter(params: Record<string, number>, key: string, label: string): number {
  const value = params[key]
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new StrategyError(`${label}必须为整数`)
  }
  return value
}

function within(value: number, label: string, minimum: number, maximum: number): void {
  if (value < minimum || value > maximum) {
    throw new StrategyError(`${label}必须在 ${minimum} 到 ${maximum} 之间`)
  }
}

function requireHistory(bars: MarketBar[], strategy: string, minimumBars: number): void {
  if (bars.length < minimumBars) {
    throw new InsufficientHistoryError(`${strategy}策略至少需要 ${minimumBars} 个交易日`)
  }
}

function rollingMean(values: number[], window: number): Array<number | null> {
  const result: Array<number | null> = new Array(values.length).fill(null)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= window) {
      sum -= values[i - window]
    }
    if (i >= window - 1) {
      result[i] = sum / window
    }
  }
  return result
}

function rollingMax(values: number[], window: number): Array<number | null> {
  const result: Array<number | null> = new Array(values.length).fill(null)
  for (let i = window - 1; i < values.length; i++) {
    let max = -Infinity
    for (let j = i - window + 1; j <= i; j++) {
      if (values[j] > max) max = values[j]
    }
    result[i] = max
  }
  return result
}

function rollingMin(values: number[], window: number): Array<number | null> {
  const result: Array<number | null> = new Array(values.length).fill(null)
  for (let i = window - 1; i < values.length; i++) {
    let min = Infinity
    for (let j = i - window + 1; j <= i; j++) {
      if (values[j] < min) min = values[j]
    }
    result[i] = min
  }
  return result
}

function shiftOne(values: Array<number | null>): Array<number | null> {
  if (values.length === 0) return []
  return [null, ...values.slice(0, -1)]
}

function wilderAverage(values: Array<number | null>, period: number): Array<number | null> {
  const average: Array<number | null> = new Array(values.length).fill(null)
  if (values.length <= period) {
    return average
  }
  let sum = 0
  for (let i = 1; i <= period; i++) {
    sum += values[i] ?? 0
  }
  let previous = sum / period
  average[period] = previous
  for (let i = period + 1; i < values.length; i++) {
    previous = ((period - 1) * previous + (values[i] ?? 0)) / period
    average[i] = previous
  }
  return average
}

function buyHold(bars: MarketBar[]): StrategyOutput {
  if (bars.length < 1) {
    throw new InsufficientHistoryError('买入并持有策略至少需要 1 个交易日')
  }
  return {
    target: new Array<0 | 1>(bars.length).fill(1),
    indicators: {},
    warmup: 0,
  }
}

function smaCross(bars: MarketBar[], params: Record<string, number>): StrategyOutput {
  const shortWindow = integerParameter(params, 'short_window', '短均线周期')
  const longWindow = integerParameter(params, 'long_window', '长均线周期')
  if (shortWindow >= longWindow) {
    throw new StrategyError('短均线周期必须小于长均线周期')
  }
  within(shortWindow, '短均线周期', 2, 200)
  within(longWindow, '长均线周期', 3, 400)
  requireHistory(bars, '均线交叉', longWindow)

  const closes = bars.map((bar) => bar.close)
  const shortSma = rollingMean(closes, shortWindow)
  const longSma = rollingMean(closes, longWindow)
  const prevShort = shiftOne(shortSma)
  const prevLong = shiftOne(longSma)

  const buy = bars.map((_, i) => {
    const ps = prevShort[i]
    const pl = prevLong[i]
    const cs = shortSma[i]
    const cl = longSma[i]
    return ps !== null && pl !== null && cs !== null && cl !== null && ps <= pl && cs > cl
  })
  const sell = bars.map((_, i) => {
    const ps = prevShort[i]
    const pl = prevLong[i]
    const cs = shortSma[i]
    const cl = longSma[i]
    return ps !== null && pl !== null && cs !== null && cl !== null && ps >= pl && cs < cl
  })

  return {
    target: targetFromEvents(bars.length, buy, sell),
    indicators: { short_sma: shortSma, long_sma: longSma },
    warmup: longWindow,
  }
}

function rsiReversal(bars: MarketBar[], params: Record<string, number>): StrategyOutput {
  const period = integerParameter(params, 'period', 'RSI 周期')
  const oversold = integerParameter(params, 'oversold', '超卖阈值')
  const overbought = integerParameter(params, 'overbought', '超买阈值')
  if (oversold >= overbought) {
    throw new StrategyError('超卖阈值必须小于超买阈值')
  }
  within(period, 'RSI 周期', 2, 100)
  within(oversold, '超卖阈值', 1, 49)
  within(overbought, '超买阈值', 51, 99)
  requireHistory(bars, 'RSI 反转', period + 1)

  const gains: Array<number | null> = new Array(bars.length).fill(null)
  const losses: Array<number | null> = new Array(bars.length).fill(null)
  for (let i = 1; i < bars.length; i++) {
    const diff = bars[i].close - bars[i - 1].close
    gains[i] = diff > 0 ? diff : 0
    losses[i] = diff < 0 ? -diff : 0
  }

  const avgGain = wilderAverage(gains, period)
  const avgLoss = wilderAverage(losses, period)
  const rsi: Array<number | null> = bars.map((_, i) => {
    const g = avgGain[i]
    const l = avgLoss[i]
    if (g === null || l === null) return null
    if (g === 0 && l === 0) return 50.0
    if (l === 0) return 100.0
    const rs = g / l
    return 100 - 100 / (1 + rs)
  })

  const prevRsi = shiftOne(rsi)
  const buy = rsi.map((curr, i) => {
    const prev = prevRsi[i]
    return prev !== null && curr !== null && prev <= oversold && curr > oversold
  })
  const sell = rsi.map((curr, i) => {
    const prev = prevRsi[i]
    return prev !== null && curr !== null && prev <= overbought && curr > overbought
  })

  return {
    target: targetFromEvents(bars.length, buy, sell),
    indicators: { rsi },
    warmup: period,
  }
}

function donchian(bars: MarketBar[], params: Record<string, number>): StrategyOutput {
  const entryWindow = integerParameter(params, 'entry_window', '入场通道周期')
  const exitWindow = integerParameter(params, 'exit_window', '退出通道周期')
  if (entryWindow <= 0) {
    throw new StrategyError('入场通道周期必须为正整数')
  }
  if (exitWindow <= 0) {
    throw new StrategyError('退出通道周期必须为正整数')
  }
  within(entryWindow, '入场通道周期', 2, 252)
  within(exitWindow, '退出通道周期', 2, 252)
  requireHistory(bars, '唐奇安通道突破', Math.max(entryWindow, exitWindow) + 1)

  const entryHigh = shiftOne(rollingMax(bars.map((b) => b.high), entryWindow))
  const exitLow = shiftOne(rollingMin(bars.map((b) => b.low), exitWindow))

  const buy = bars.map((b, i) => entryHigh[i] !== null && b.close > (entryHigh[i] as number))
  const sell = bars.map((b, i) => exitLow[i] !== null && b.close < (exitLow[i] as number))

  return {
    target: targetFromEvents(bars.length, buy, sell),
    indicators: { entry_high: entryHigh, exit_low: exitLow },
    warmup: Math.max(entryWindow, exitWindow),
  }
}

export function generateSignals(bars: MarketBar[], config: StrategyConfig): StrategyOutput {
  switch (config.key) {
    case 'buy_hold':
      return buyHold(bars)
    case 'sma_cross':
      return smaCross(bars, config.params)
    case 'rsi_reversal':
      return rsiReversal(bars, config.params)
    case 'donchian':
      return donchian(bars, config.params)
    default:
      throw new StrategyError('不支持的策略')
  }
}
