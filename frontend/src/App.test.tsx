import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { BacktestResponse } from './types'

const fetchStrategiesMock = vi.hoisted(() => vi.fn())
const backtestResult: BacktestResponse = {
  metadata: { datasetId: 'app-result', strategyKey: 'buy_hold', start: '2024-01-02', end: '2024-01-03', execution: 'next_open', warmup: 0, initialCash: 10000, commission: 0, slippageBps: 5 },
  metrics: { endingEquity: 10100, totalReturn: 0.01, cagr: 0.01, annualizedVolatility: 0.1, sharpeRatio: 0.5, maxDrawdown: -0.02, tradeCount: 0, winRate: null },
  series: { dates: [], open: [], high: [], low: [], close: [], cash: [], shares: [], holdings: [], equity: [], strategy: [], benchmark: [], drawdown: [], benchmarkDrawdown: [] },
  indicators: {}, fills: [], trades: [], warnings: [],
}

vi.mock('./api', () => ({ fetchStrategies: fetchStrategiesMock }))
vi.mock('./components/BacktestForm', () => ({
  BacktestForm: ({ onRun }: { onRun: (result: BacktestResponse) => void }) => <button type="button" onClick={() => onRun(backtestResult)}>交付回测结果</button>,
}))
vi.mock('echarts/core', () => ({ init: () => ({ dispose: vi.fn(), resize: vi.fn(), setOption: vi.fn() }), use: vi.fn() }))

describe('App result integration', () => {
  beforeEach(() => {
    fetchStrategiesMock.mockResolvedValue([{ key: 'buy_hold', name: '买入并持有', description: '长期持有。', parameters: [], validationRules: [] }])
  })

  it('renders ResultsDashboard with the result emitted by BacktestForm', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: '交付回测结果' }))

    expect(await screen.findByRole('region', { name: '回测结果' })).toHaveTextContent('buy_hold 回测结果')
  })
})
