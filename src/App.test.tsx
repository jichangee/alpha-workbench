import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { BacktestResponse } from './types'

const fetchStrategiesMock = vi.hoisted(() => vi.fn())
const backtestResult: BacktestResponse = {
  metadata: { datasetId: 'app-result', strategyKey: 'buy_hold', start: '2024-01-02', end: '2024-01-03', execution: 'first_open_then_next_open', warmup: 0, initialCash: 10000, commission: 0, slippageBps: 5 },
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

    expect(screen.getByRole('banner')).toHaveTextContent('美股量化研究台')
    expect(screen.getByText('本地运行')).toBeVisible()
    await user.click(await screen.findByRole('button', { name: '交付回测结果' }))

    expect(await screen.findByRole('region', { name: '回测结果' })).toHaveTextContent('买入并持有 回测结果')
  })

  it('switches between backtest and portfolio comparison workspaces', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(await screen.findByRole('button', { name: '交付回测结果' })).toBeVisible()
    await user.click(screen.getByRole('tab', { name: '持仓对比' }))

    expect(screen.getByRole('button', { name: '开始对比' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '交付回测结果' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '持仓对比' })).toHaveAttribute('aria-selected', 'true')

    await user.click(screen.getByRole('tab', { name: '策略回测' }))
    expect(screen.getByRole('button', { name: '交付回测结果' })).toBeVisible()
    expect(screen.getByRole('tab', { name: '策略回测' })).toHaveAttribute('aria-selected', 'true')
  })
})
