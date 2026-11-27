import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ResultsDashboard } from './ResultsDashboard'
import type { BacktestResponse } from '../types'

vi.mock('echarts/core', () => ({
  connect: vi.fn(),
  init: () => ({ dispose: vi.fn(), resize: vi.fn(), setOption: vi.fn() }),
  use: vi.fn(),
}))

const openPositionFixture: BacktestResponse = {
  metadata: { datasetId: 'demo', strategyKey: 'sma_cross', start: '2024-01-02', end: '2024-01-03', execution: 'first_open_then_next_open', warmup: 20, initialCash: 10000, commission: 1, slippageBps: 5 },
  metrics: { endingEquity: 10100, totalReturn: 0.01, cagr: 0.01, annualizedVolatility: 0.1, sharpeRatio: 0.5, maxDrawdown: -0.02, tradeCount: 0, winRate: null },
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

  it('switches chart views through semantic tabs', async () => {
    const user = userEvent.setup()
    render(<ResultsDashboard result={openPositionFixture} />)

    await user.click(screen.getByRole('tab', { name: '价格与信号' }))

    expect(screen.getByRole('tab', { name: '价格与信号' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: '绩效走势' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.queryByRole('tab', { name: '风险回撤' })).not.toBeInTheDocument()
    expect(await screen.findByRole('img', { name: '价格、技术指标及交易成交标记' })).toBeVisible()
    expect(await screen.findByRole('img', { name: '策略及基准回撤走势' })).toBeVisible()
  })

  it('shows Chinese strategy and indicator labels instead of wire keys', async () => {
    const user = userEvent.setup()
    render(<ResultsDashboard result={{
      ...openPositionFixture,
      indicators: { short_sma: [100, 101], long_sma: [99, 100] },
    }} />)

    expect(screen.getByRole('heading', { name: '均线交叉 回测结果' })).toBeVisible()
    await user.click(screen.getByRole('tab', { name: '价格与信号' }))
    expect(await screen.findByText('短期均线')).toBeVisible()
    expect(screen.getByText('长期均线')).toBeVisible()
  })

  it('keeps open positions beside closed trades and exposes all P&L columns', () => {
    const mixedTrades = [
      { entryDate: '2024-01-02', entryPrice: 100, shares: 10, exitDate: '2024-01-04', exitPrice: 105, grossPnl: 50, costs: 2.5, netPnl: 47.5, returnPct: 0.0475, isOpen: false },
      { entryDate: '2024-01-05', entryPrice: 110, shares: 8, exitDate: null, exitPrice: null, grossPnl: null, costs: 1, netPnl: null, returnPct: null, isOpen: true },
    ]
    render(<ResultsDashboard result={{ ...openPositionFixture, metrics: { ...openPositionFixture.metrics, tradeCount: 1 }, trades: mixedTrades }} />)

    expect(screen.getAllByRole('row')).toHaveLength(3)
    expect(screen.getByRole('columnheader', { name: '毛盈亏' })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: '成本' })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: '净盈亏' })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: '收益率' })).toBeVisible()
    expect(screen.getByText('持仓中')).toBeVisible()
    expect(screen.getByText('+$50.00')).toBeVisible()
    expect(screen.getByText('+$47.50')).toBeVisible()
  })

  it('labels rotation symbols, first-day execution, and each trade symbol', () => {
    const rotationResult: BacktestResponse = {
      ...openPositionFixture,
      metadata: {
        ...openPositionFixture.metadata,
        positionMode: 'rotate',
        primarySymbol: 'SPY',
        alternateSymbol: 'QQQ',
      },
      trades: [{ ...openPositionFixture.trades[0], symbol: 'QQQ' }],
    }

    render(<ResultsDashboard result={rotationResult} />)

    expect(screen.getByText('SPY ↔ QQQ')).toBeVisible()
    expect(screen.getByText(/首日开盘建仓 · 后续次日开盘调仓/)).toBeVisible()
    expect(screen.getByRole('columnheader', { name: '标的' })).toBeVisible()
    expect(screen.getByRole('cell', { name: 'QQQ' })).toBeVisible()
  })
})
