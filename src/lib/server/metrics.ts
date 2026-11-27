import type { BacktestMetrics, BacktestTrade } from '@/types'

export class MetricsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MetricsError'
  }
}

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null
}

function sampleStd(values: number[]): number {
  const mean = values.reduce((acc, v) => acc + v, 0) / values.length
  let sumSq = 0
  for (const v of values) {
    const diff = v - mean
    sumSq += diff * diff
  }
  return Math.sqrt(sumSq / (values.length - 1))
}

export function calculateMetrics(
  equity: number[],
  trades: BacktestTrade[],
  initialCash: number,
): BacktestMetrics {
  if (equity.length === 0) {
    throw new MetricsError('净值序列不能为空')
  }
  if (equity.some((v) => !Number.isFinite(v)) || equity[0] <= 0) {
    throw new MetricsError('净值必须是有限数，且首个值必须为正数')
  }
  if (!Number.isFinite(initialCash) || initialCash <= 0) {
    throw new MetricsError('初始资金必须是有限正数')
  }

  const endingEquity = equity[equity.length - 1]
  const growthRatio = finiteOrNull(endingEquity / initialCash)
  const totalReturn = growthRatio !== null ? finiteOrNull(growthRatio - 1) : null
  const periods = equity.length - 1
  const cagr =
    periods > 0 && growthRatio !== null && growthRatio > 0
      ? finiteOrNull(growthRatio ** (252 / periods) - 1)
      : null

  const dailyReturns: number[] = []
  for (let i = 1; i < equity.length; i++) {
    dailyReturns.push(equity[i] / equity[i - 1] - 1)
  }

  let annualizedVolatility: number | null = null
  let sharpeRatio: number | null = null
  if (dailyReturns.length >= 2) {
    const dailyStd = sampleStd(dailyReturns)
    annualizedVolatility = finiteOrNull(dailyStd * Math.sqrt(252))
    if (Number.isFinite(dailyStd) && dailyStd !== 0) {
      const meanReturn = dailyReturns.reduce((acc, v) => acc + v, 0) / dailyReturns.length
      sharpeRatio = finiteOrNull((meanReturn / dailyStd) * Math.sqrt(252))
    }
  }

  let peak = -Infinity
  let maxDrawdownValue = 0
  for (const v of equity) {
    if (v > peak) peak = v
    const dd = v / peak - 1
    if (dd < maxDrawdownValue) maxDrawdownValue = dd
  }

  const closedTrades = trades.filter((trade) => trade.exitDate !== null)
  const winCount = closedTrades.filter((trade) => trade.netPnl !== null && trade.netPnl > 0).length
  const winRate = closedTrades.length > 0 ? winCount / closedTrades.length : null

  return {
    endingEquity,
    totalReturn,
    cagr,
    annualizedVolatility,
    sharpeRatio,
    maxDrawdown: finiteOrNull(maxDrawdownValue),
    tradeCount: closedTrades.length,
    winRate,
  }
}
