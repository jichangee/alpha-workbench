import type {
  PortfolioComparisonInput,
  PortfolioComparisonMetrics,
  PortfolioComparisonResponse,
  PortfolioComparisonSeries,
  PortfolioDefinitionInput,
  RebalanceFrequency,
} from '@/types'
import type { MarketBar } from './market-data'

export class PortfolioComparisonError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PortfolioComparisonError'
  }
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
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

function periodKey(isoDate: string, frequency: RebalanceFrequency): string {
  const year = isoDate.slice(0, 4)
  const month = Number(isoDate.slice(5, 7))
  if (frequency === 'monthly') return `${year}-${month}`
  if (frequency === 'quarterly') return `${year}-Q${Math.floor((month - 1) / 3) + 1}`
  if (frequency === 'yearly') return year
  return ''
}

function alignedCloses(
  symbols: string[],
  barsBySymbol: Record<string, MarketBar[]>,
): { dates: string[]; closesBySymbol: Record<string, number[]> } {
  const maps: Record<string, Map<string, number>> = {}
  for (const symbol of symbols) {
    const bars = barsBySymbol[symbol]
    if (!bars || bars.length === 0) {
      throw new PortfolioComparisonError(`${symbol} 缺少有效的复权收盘价`)
    }
    const map = new Map<string, number>()
    for (const bar of bars) {
      if (Number.isFinite(bar.close) && bar.close > 0) {
        map.set(bar.date, bar.close)
      }
    }
    maps[symbol] = map
  }

  const firstSymbol = symbols[0]
  const commonDates = Array.from(maps[firstSymbol].keys())
    .filter((date) => symbols.every((symbol) => maps[symbol].has(date)))
    .sort((a, b) => a.localeCompare(b))

  if (commonDates.length < 2) {
    throw new PortfolioComparisonError('全部股票至少需要两个共同交易日')
  }

  const closesBySymbol: Record<string, number[]> = {}
  for (const symbol of symbols) {
    closesBySymbol[symbol] = commonDates.map((date) => maps[symbol].get(date)!)
  }
  return { dates: commonDates, closesBySymbol }
}

function calculatePortfolio(
  portfolio: PortfolioDefinitionInput,
  dates: string[],
  closesBySymbol: Record<string, number[]>,
): PortfolioComparisonSeries {
  const symbols = portfolio.positions.map((p) => p.symbol)
  const targetWeights = portfolio.positions.map((p) => p.weight)
  let weights = [...targetWeights]
  const equity = [100.0]
  const rebalanceDates: string[] = []

  for (let offset = 1; offset < dates.length; offset++) {
    const relatives = symbols.map(
      (symbol) => closesBySymbol[symbol][offset] / closesBySymbol[symbol][offset - 1],
    )
    const growth = weights.reduce((acc, w, i) => acc + w * relatives[i], 0)
    equity.push(equity[equity.length - 1] * growth)
    weights = weights.map((w, i) => (w * relatives[i]) / growth)

    const hasNext = offset < dates.length - 1
    const frequency = portfolio.rebalanceFrequency
    const rebalanceThreshold = portfolio.rebalanceThreshold ?? 5
    const thresholdReached = weights.some(
      (w, i) => Math.abs(w - targetWeights[i]) >= rebalanceThreshold / 100,
    )

    if (
      hasNext &&
      (((frequency === 'monthly' || frequency === 'quarterly' || frequency === 'yearly') &&
        periodKey(dates[offset], frequency) !== periodKey(dates[offset + 1], frequency)) ||
        (frequency === 'threshold' && thresholdReached))
    ) {
      weights = [...targetWeights]
      rebalanceDates.push(dates[offset])
    }
  }

  const returns: number[] = []
  for (let i = 1; i < equity.length; i++) {
    returns.push(equity[i] / equity[i - 1] - 1)
  }

  let peak = -Infinity
  let maxDrawdown = 0
  for (const v of equity) {
    if (v > peak) peak = v
    const dd = v / peak - 1
    if (dd < maxDrawdown) maxDrawdown = dd
  }

  const startMs = Date.parse(`${dates[0]}T00:00:00Z`)
  const endMs = Date.parse(`${dates[dates.length - 1]}T00:00:00Z`)
  const elapsedDays = (endMs - startMs) / (1000 * 60 * 60 * 24)
  const cagr =
    elapsedDays > 0
      ? (equity[equity.length - 1] / equity[0]) ** (365.25 / elapsedDays) - 1
      : null

  let annualizedVolatility: number | null = null
  let sharpeRatio: number | null = null
  if (returns.length >= 2) {
    const dailyStd = sampleStd(returns)
    annualizedVolatility = dailyStd * Math.sqrt(252)
    if (Number.isFinite(dailyStd) && dailyStd !== 0) {
      const meanReturn = returns.reduce((acc, v) => acc + v, 0) / returns.length
      sharpeRatio = (meanReturn / dailyStd) * Math.sqrt(252)
    }
  }

  const metrics: PortfolioComparisonMetrics = {
    totalReturn: roundTo(equity[equity.length - 1] / equity[0] - 1, 12),
    cagr,
    annualizedVolatility,
    sharpeRatio,
    maxDrawdown,
  }

  return {
    name: portfolio.name,
    positions: portfolio.positions,
    rebalanceFrequency: portfolio.rebalanceFrequency,
    rebalanceDates,
    rebalanceThreshold: portfolio.rebalanceThreshold ?? 5,
    equity: equity.map((v) => roundTo(v, 10)),
    metrics,
  }
}

export function calculatePortfolioComparison(
  request: PortfolioComparisonInput,
  barsBySymbol: Record<string, MarketBar[]>,
): PortfolioComparisonResponse {
  const symbols = Array.from(
    new Set(request.portfolios.flatMap((portfolio) => portfolio.positions.map((p) => p.symbol))),
  )
  const { dates, closesBySymbol } = alignedCloses(symbols, barsBySymbol)
  const portfolios = request.portfolios.map((portfolio) =>
    calculatePortfolio(portfolio, dates, closesBySymbol),
  )

  return {
    start: dates[0],
    end: dates[dates.length - 1],
    dates,
    portfolios,
  }
}
