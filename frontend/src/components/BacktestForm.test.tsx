import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api'
import { BacktestForm } from './BacktestForm'
import type { BacktestResponse } from '../types'

const runBacktestMock = vi.hoisted(() => vi.fn())

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return { ...actual, runBacktest: runBacktestMock }
})

const catalogFixture = [
  {
    key: 'buy_hold',
    name: '买入并持有',
    description: '长期持有。',
    parameters: [],
    validationRules: [],
  },
  {
    key: 'sma_cross',
    name: '均线交叉',
    description: '短期均线上穿长期均线时买入。',
    parameters: [
      { key: 'short_window', name: '短均线周期', description: '短期交易日数。', type: 'integer', default: 20, minimum: 2, maximum: 200 },
      { key: 'long_window', name: '长均线周期', description: '长期交易日数。', type: 'integer', default: 50, minimum: 3, maximum: 400 },
    ],
    validationRules: [{ expression: 'short_window < long_window', message: '短均线周期必须小于长均线周期' }],
  },
  {
    key: 'rsi_reversal',
    name: 'RSI 反转',
    description: 'RSI 反转。',
    parameters: [{ key: 'period', name: 'RSI 周期', description: 'RSI 天数。', type: 'integer', default: 14, minimum: 2, maximum: 100 }],
    validationRules: [],
  },
] as const

const successfulResult: BacktestResponse = {
  metadata: { datasetId: 'newer', strategyKey: 'buy_hold', start: '2021-01-01', end: '2021-12-31', execution: 'next_open', warmup: 0, initialCash: 100000, commission: 0, slippageBps: 5 },
  metrics: { endingEquity: 100000, totalReturn: 0, cagr: null, annualizedVolatility: null, sharpeRatio: null, maxDrawdown: 0, tradeCount: 0, winRate: null },
  series: { dates: [], open: [], high: [], low: [], close: [], cash: [], shares: [], holdings: [], equity: [], strategy: [], benchmark: [], drawdown: [], benchmarkDrawdown: [] },
  indicators: {}, fills: [], trades: [], warnings: [],
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => { resolve = complete })
  return { promise, resolve }
}

describe('BacktestForm', () => {
  beforeEach(() => vi.clearAllMocks())
  it('shows only the selected strategy parameters', async () => {
    const user = userEvent.setup()
    render(<BacktestForm strategies={catalogFixture} onRun={vi.fn()} />)

    await user.selectOptions(screen.getByLabelText('策略'), 'sma_cross')

    expect(screen.getByLabelText('短均线周期')).toBeVisible()
    expect(screen.getByLabelText('长均线周期')).toBeVisible()
    expect(screen.queryByLabelText('RSI 周期')).not.toBeInTheDocument()
  })

  it('blocks an invalid moving-average relationship with Chinese guidance', async () => {
    const user = userEvent.setup()
    render(<BacktestForm strategies={catalogFixture} onRun={vi.fn()} />)

    await user.selectOptions(screen.getByLabelText('策略'), 'sma_cross')
    await user.clear(screen.getByLabelText('短均线周期'))
    await user.type(screen.getByLabelText('短均线周期'), '50')
    await user.clear(screen.getByLabelText('长均线周期'))
    await user.type(screen.getByLabelText('长均线周期'), '20')
    await user.click(screen.getByRole('button', { name: '运行回测' }))

    expect(screen.getByText('短均线周期必须小于长均线周期')).toBeVisible()
  })

  it('switches to the CSV upload fields when the local source is selected', async () => {
    const user = userEvent.setup()
    render(<BacktestForm strategies={catalogFixture} onRun={vi.fn()} />)

    await user.selectOptions(screen.getByLabelText('数据来源'), 'csv')

    expect(screen.getByLabelText('CSV 文件')).toBeVisible()
    expect(screen.queryByLabelText('开始日期')).not.toBeInTheDocument()
  })

  it('shows a disabled running state while the submitted workflow is pending', async () => {
    const user = userEvent.setup()
    const pending = deferred<BacktestResponse>()
    const onRun = vi.fn()
    const onStateChange = vi.fn()
    runBacktestMock.mockReturnValue(pending.promise)
    render(<BacktestForm strategies={catalogFixture} onRun={onRun} onStateChange={onStateChange} />)

    await user.click(screen.getByRole('button', { name: '运行回测' }))

    expect(screen.getByRole('button', { name: '正在运行回测…' })).toBeDisabled()
    expect(onStateChange).toHaveBeenCalledWith('running')
    await act(async () => pending.resolve(successfulResult))
    await waitFor(() => expect(onRun).toHaveBeenCalledWith(successfulResult))
  })

  it('keeps entered values and shows a Chinese API message after an API error', async () => {
    const user = userEvent.setup()
    runBacktestMock.mockRejectedValue(new ApiError({ code: 'MARKET_DATA_ERROR', message: '行情数据不可用，请改用 CSV。', fields: {} }))
    render(<BacktestForm strategies={catalogFixture} onRun={vi.fn()} />)

    await user.clear(screen.getByLabelText('股票代码'))
    await user.type(screen.getByLabelText('股票代码'), 'MSFT')
    await user.selectOptions(screen.getByLabelText('策略'), 'sma_cross')
    await user.clear(screen.getByLabelText('短均线周期'))
    await user.type(screen.getByLabelText('短均线周期'), '10')
    await user.click(screen.getByRole('button', { name: '运行回测' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('行情数据不可用，请改用 CSV。')
    expect(screen.getByLabelText('股票代码')).toHaveValue('MSFT')
    expect(screen.getByLabelText('短均线周期')).toHaveValue(10)
  })

  it('aborts a previous run and ignores its stale completion when a new run starts', async () => {
    const user = userEvent.setup()
    const first = deferred<BacktestResponse>()
    const second = deferred<BacktestResponse>()
    const onRun = vi.fn()
    runBacktestMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    render(<BacktestForm strategies={catalogFixture} onRun={onRun} />)

    await user.click(screen.getByRole('button', { name: '运行回测' }))
    const form = screen.getByRole('button', { name: '正在运行回测…' }).closest('form')!
    fireEvent.submit(form)

    const firstSignal = runBacktestMock.mock.calls[0][1] as AbortSignal
    expect(firstSignal.aborted).toBe(true)
    await act(async () => first.resolve({ ...successfulResult, metadata: { ...successfulResult.metadata, datasetId: 'stale' } }))
    expect(onRun).not.toHaveBeenCalled()
    await act(async () => second.resolve(successfulResult))
    await waitFor(() => expect(onRun).toHaveBeenCalledTimes(1))
    expect(onRun).toHaveBeenLastCalledWith(successfulResult)
  })
})
