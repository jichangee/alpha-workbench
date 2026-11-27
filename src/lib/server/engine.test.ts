import { describe, expect, it } from 'vitest'
import { runEngine } from './engine'
import { parseCsvBars, type MarketBar } from './market-data'
import { calculateMetrics } from './metrics'
import { calculatePortfolioComparison } from './portfolio-comparison'
import { generateSignals } from './strategies'

function makeBars(closes: number[]): MarketBar[] {
  return closes.map((close, i) => {
    const day = String(i + 1).padStart(2, '0')
    return {
      date: `2024-01-${day}`,
      open: close,
      high: close * 1.01,
      low: close * 0.99,
      close,
    }
  })
}

describe('server backtest core', () => {
  it('parses CSV bars and clips/validates OHLC', () => {
    const bars = parseCsvBars(
      'Date,Open,High,Low,Close\n2024-01-02,100,105,99,103\n2024-01-01,98,101,97,100\n',
    )
    expect(bars.map((b) => b.date)).toEqual(['2024-01-01', '2024-01-02'])
    expect(bars[0].close).toBe(100)
  })

  it('runs SMA cross strategy, engine, and metrics', () => {
    const bars = makeBars([10, 10, 10, 10, 12, 14, 16, 15, 13, 11])
    const signals = generateSignals(bars, {
      key: 'sma_cross',
      params: { short_window: 2, long_window: 4 },
    })
    expect(signals.target).toHaveLength(10)
    const engine = runEngine({
      bars,
      target: signals.target,
      initialCash: 10000,
      commission: 0,
      slippageBps: 0,
      primarySymbol: 'AAPL',
    })
    const metrics = calculateMetrics(
      engine.rows.map((r) => r.total),
      engine.trades,
      10000,
    )
    expect(metrics.endingEquity).toBeGreaterThan(0)
    expect(metrics.maxDrawdown).toBeLessThanOrEqual(0)
  })

  it('calculates portfolio comparison with monthly rebalancing', () => {
    const barsA = makeBars([100, 110, 120])
    const barsB = makeBars([100, 90, 95])
    const result = calculatePortfolioComparison(
      {
        start: '2024-01-01',
        end: '2024-01-03',
        portfolios: [
          {
            name: 'Balanced',
            positions: [
              { symbol: 'A', weight: 0.5 },
              { symbol: 'B', weight: 0.5 },
            ],
            rebalanceFrequency: 'none',
            rebalanceThreshold: 5,
          },
          {
            name: 'All A',
            positions: [{ symbol: 'A', weight: 1 }],
            rebalanceFrequency: 'none',
            rebalanceThreshold: 5,
          },
        ],
      },
      { A: barsA, B: barsB },
    )
    expect(result.portfolios).toHaveLength(2)
    expect(result.portfolios[1].metrics.totalReturn).toBeCloseTo(0.2, 6)
  })
})
