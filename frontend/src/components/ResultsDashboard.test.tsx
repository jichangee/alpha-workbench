import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ResultsDashboard } from './ResultsDashboard'
import type { BacktestResponse } from '../types'

vi.mock('echarts/core', () => ({
  init: () => ({ dispose: vi.fn(), resize: vi.fn(), setOption: vi.fn() }),
  use: vi.fn(),
}))

const openPositionFixture: BacktestResponse = {
  metadata: { datasetId: 'demo', strategyKey: 'sma_cross', start: '2024-01-02', end: '2024-01-03', execution: 'next_open', warmup: 20, initialCash: 10000, commission: 1, slippageBps: 5 },
  metrics: { endingEquity: 10100, totalReturn: 0.01, cagr: 0.01, annualizedVolatility: 0.1, sharpeRatio: 0.5, maxDrawdown: -0.02, tradeCount: 1, winRate: null },
  series: {
    dates: ['2024-01-02', '2024-01-03'], open: [100, 101], high: [102, 103], low: [99, 100], close: [101, 102], cash: [0, 0], shares: [100, 100], holdings: [10100, 10200], equity: [10000, 10100], strategy: [1, 1.01], benchmark: [1, 1.02], drawdown: [0, -0.01], benchmarkDrawdown: [0, 0],
  },
  indicators: { SMA: [100, 101] },
  fills: [{ date: '2024-01-02', side: 'buy', price: 100, shares: 100, commission: 1, notional: 10000 }],
  trades: [{ entryDate: '2024-01-02', entryPrice: 100, shares: 100, exitDate: null, exitPrice: null, grossPnl: null, costs: 1, netPnl: null, returnPct: null, isOpen: true }],
  warnings: [],
}

describe('ResultsDashboard', () => {
  it('renders strategy and benchmark labels plus an empty closed-trades state', async () => {
    render(<ResultsDashboard result={openPositionFixture} />)

    expect(await screen.findByText('策略净值')).toBeVisible()
    expect(screen.getByText('买入并持有基准')).toBeVisible()
    expect(screen.getByText('当前持仓尚未平仓')).toBeVisible()
  })
})
