import type { PortfolioComparisonResponse } from './types'

export const comparisonResultFixture: PortfolioComparisonResponse = {
  start: '2021-01-04',
  end: '2025-12-31',
  dates: ['2021-01-04', '2025-12-31'],
  portfolios: [
    {
      name: '持仓 1',
      rebalanceFrequency: 'monthly',
      rebalanceDates: ['2021-01-29', '2021-02-26'],
      positions: [{ symbol: 'VOO', weight: 0.5 }, { symbol: 'QQQ', weight: 0.5 }],
      equity: [100, 150],
      metrics: { totalReturn: 0.5, cagr: 0.0846, annualizedVolatility: 0.16, sharpeRatio: 0.53, maxDrawdown: -0.2 },
    },
    {
      name: '持仓 2',
      rebalanceFrequency: 'none',
      rebalanceDates: [],
      positions: [{ symbol: 'SOXX', weight: 1 }],
      equity: [100, 180],
      metrics: { totalReturn: 0.8, cagr: 0.1248, annualizedVolatility: 0.25, sharpeRatio: 0.5, maxDrawdown: -0.32 },
    },
  ],
}

export const threePortfolioResultFixture: PortfolioComparisonResponse = {
  ...comparisonResultFixture,
  portfolios: [
    ...comparisonResultFixture.portfolios,
    {
      name: '持仓 3',
      rebalanceFrequency: 'yearly',
      rebalanceDates: ['2021-12-31'],
      positions: [{ symbol: 'AAPL', weight: 1 }],
      equity: [100, 165],
      metrics: { totalReturn: 0.65, cagr: 0.1053, annualizedVolatility: 0.21, sharpeRatio: 0.5, maxDrawdown: -0.27 },
    },
  ],
}
