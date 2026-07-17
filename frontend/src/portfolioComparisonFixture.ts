import type { PortfolioComparisonResponse } from './types'

export const comparisonResultFixture: PortfolioComparisonResponse = {
  start: '2021-01-04',
  end: '2025-12-31',
  dates: ['2021-01-04', '2025-12-31'],
  portfolios: [
    {
      name: '持仓 1',
      positions: [{ symbol: 'VOO', weight: 0.5 }, { symbol: 'QQQ', weight: 0.5 }],
      equity: [100, 150],
      metrics: { totalReturn: 0.5, cagr: 0.0846, annualizedVolatility: 0.16, maxDrawdown: -0.2 },
    },
    {
      name: '持仓 2',
      positions: [{ symbol: 'SOXX', weight: 1 }],
      equity: [100, 180],
      metrics: { totalReturn: 0.8, cagr: 0.1248, annualizedVolatility: 0.25, maxDrawdown: -0.32 },
    },
  ],
}
