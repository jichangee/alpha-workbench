import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api'
import { BacktestForm } from './BacktestForm'
import type { BacktestResponse, MarketDataPreview } from '../types'

const { previewMarketDataMock, runBacktestForDatasetMock } = vi.hoisted(() => ({
  previewMarketDataMock: vi.fn(),
  runBacktestForDatasetMock: vi.fn(),
}))

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return {
    ...actual,
    previewMarketData: previewMarketDataMock,
    runBacktestForDataset: runBacktestForDatasetMock,
  }
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

const previewFixture: MarketDataPreview = {
  datasetId: 'dataset-42', symbol: 'SPY', start: '2021-01-01', end: '2021-12-31', rows: 252, preview: [], warnings: [],
}

const successfulResult: BacktestResponse = {
  metadata: { datasetId: 'dataset-42', strategyKey: 'buy_hold', start: '2021-01-01', end: '2021-12-31', execution: 'first_open_then_next_open', warmup: 0, initialCash: 100000, commission: 0, slippageBps: 5 },
  metrics: { endingEquity: 100000, totalReturn: 0, cagr: null, annualizedVolatility: null, sharpeRatio: null, maxDrawdown: 0, tradeCount: 0, winRate: null },
  series: { dates: [], open: [], high: [], low: [], close: [], cash: [], shares: [], holdings: [], equity: [], strategy: [], benchmark: [], drawdown: [], benchmarkDrawdown: [] },
  indicators: {}, fills: [], trades: [], warnings: [],
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => { resolve = complete })
  return { promise, resolve }
}

async function loadMarketData() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '加载行情并开始回测' }))
  await waitFor(() => expect(runBacktestForDatasetMock).toHaveBeenCalledTimes(1))
  await screen.findByText('参数调整后自动回测')
}

describe('BacktestForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    previewMarketDataMock.mockReset()
    runBacktestForDatasetMock.mockReset()
    previewMarketDataMock.mockResolvedValue(previewFixture)
    runBacktestForDatasetMock.mockResolvedValue(successfulResult)
  })
  afterEach(() => vi.useRealTimers())

  it('defaults to the five complete calendar years using local dates', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 1, 0, 30))

    render(<BacktestForm strategies={catalogFixture} onRun={vi.fn()} />)

    expect(screen.getByLabelText('开始日期')).toHaveValue('2021-01-01')
    expect(screen.getByLabelText('结束日期')).toHaveValue('2025-12-31')
  })

  it('uses strategy buttons and shows only the selected strategy sliders', async () => {
    const user = userEvent.setup()
    render(<BacktestForm strategies={catalogFixture} onRun={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '均线交叉' }))

    expect(screen.getByLabelText('短均线周期滑块')).toBeVisible()
    expect(screen.getByLabelText('长均线周期滑块')).toBeVisible()
    expect(screen.queryByLabelText('RSI 周期滑块')).not.toBeInTheDocument()
  })

  it('keeps the moving-average windows valid while a slider moves', async () => {
    const user = userEvent.setup()
    render(<BacktestForm strategies={catalogFixture} onRun={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: '均线交叉' }))

    fireEvent.change(screen.getByLabelText('短均线周期滑块'), { target: { value: '50' } })

    expect(screen.getByLabelText('长均线周期数值')).toHaveValue(51)
  })

  it('switches to the CSV upload fields when the local source is selected', async () => {
    const user = userEvent.setup()
    render(<BacktestForm strategies={catalogFixture} onRun={vi.fn()} />)

    await user.selectOptions(screen.getByLabelText('数据来源'), 'csv')

    expect(screen.getByLabelText('CSV 文件')).toBeVisible()
    expect(screen.queryByLabelText('开始日期')).not.toBeInTheDocument()
  })

  it('validates the alternate symbol in rotation mode', async () => {
    const user = userEvent.setup()
    render(<BacktestForm strategies={catalogFixture} onRun={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '卖出后换仓' }))
    await user.click(screen.getByRole('button', { name: '加载两只股票并开始回测' }))
    expect(screen.getByRole('alert')).toHaveTextContent('请输入替代股票代码。')

    await user.type(screen.getByLabelText('替代股票代码'), 'SPY')
    await user.click(screen.getByRole('button', { name: '加载两只股票并开始回测' }))
    expect(screen.getByRole('alert')).toHaveTextContent('替代股票不能与主股票相同。')
  })

  it('loads both stocks and reuses both dataset IDs for automatic backtests', async () => {
    const user = userEvent.setup()
    const alternatePreview = { ...previewFixture, datasetId: 'dataset-qqq', symbol: 'QQQ' }
    previewMarketDataMock.mockReset()
    previewMarketDataMock.mockResolvedValueOnce(previewFixture).mockResolvedValueOnce(alternatePreview)
    render(<BacktestForm strategies={catalogFixture} onRun={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: '卖出后换仓' }))
    await user.type(screen.getByLabelText('替代股票代码'), 'qqq')

    await user.click(screen.getByRole('button', { name: '加载两只股票并开始回测' }))
    await waitFor(() => expect(runBacktestForDatasetMock).toHaveBeenCalledTimes(1))

    expect(previewMarketDataMock).toHaveBeenCalledTimes(2)
    expect(previewMarketDataMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ source: 'yahoo', symbol: 'QQQ', start: previewFixture.start, end: previewFixture.end }),
      expect.any(AbortSignal),
    )
    expect(runBacktestForDatasetMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ positionMode: 'rotate', alternateSymbol: 'QQQ' }),
      'dataset-42',
      'dataset-qqq',
      expect.any(AbortSignal),
    )

    await user.click(screen.getByRole('button', { name: '均线交叉' }))
    await waitFor(() => expect(runBacktestForDatasetMock).toHaveBeenCalledTimes(2), { timeout: 1000 })
    expect(previewMarketDataMock).toHaveBeenCalledTimes(2)
    expect(runBacktestForDatasetMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ strategyKey: 'sma_cross' }),
      'dataset-42',
      'dataset-qqq',
      expect.any(AbortSignal),
    )
  })

  it('loads market data before running the first backtest', async () => {
    const onRun = vi.fn()
    render(<BacktestForm strategies={catalogFixture} onRun={onRun} />)

    await loadMarketData()

    expect(previewMarketDataMock).toHaveBeenCalledTimes(1)
    expect(runBacktestForDatasetMock).toHaveBeenCalledWith(
      expect.objectContaining({ strategyKey: 'buy_hold' }),
      'dataset-42',
      expect.any(AbortSignal),
    )
    expect(onRun).toHaveBeenCalledWith(successfulResult)
  })

  it('shows a disabled loading state while market data is pending', async () => {
    const user = userEvent.setup()
    const pending = deferred<MarketDataPreview>()
    previewMarketDataMock.mockReturnValue(pending.promise)
    render(<BacktestForm strategies={catalogFixture} onRun={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '加载行情并开始回测' }))

    expect(screen.getByRole('button', { name: '正在装载行情…' })).toBeDisabled()
    await act(async () => pending.resolve(previewFixture))
  })

  it('cancels a pending market-data load when its inputs change', async () => {
    const user = userEvent.setup()
    const pending = deferred<MarketDataPreview>()
    previewMarketDataMock.mockReturnValue(pending.promise)
    render(<BacktestForm strategies={catalogFixture} onRun={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: '加载行情并开始回测' }))
    const loadingSignal = previewMarketDataMock.mock.calls[0][1] as AbortSignal

    await user.clear(screen.getByLabelText('股票代码'))
    await user.type(screen.getByLabelText('股票代码'), 'AAPL')

    await waitFor(() => expect(loadingSignal.aborted).toBe(true))
    expect(screen.getByRole('button', { name: '加载行情并开始回测' })).toBeEnabled()
  })

  it('keeps entered values and shows a Chinese API message after a loading error', async () => {
    const user = userEvent.setup()
    previewMarketDataMock.mockRejectedValue(new ApiError({ code: 'MARKET_DATA_ERROR', message: '行情数据不可用，请改用 CSV。', fields: {} }))
    render(<BacktestForm strategies={catalogFixture} onRun={vi.fn()} />)

    await user.clear(screen.getByLabelText('股票代码'))
    await user.type(screen.getByLabelText('股票代码'), 'MSFT')
    await user.click(screen.getByRole('button', { name: '加载行情并开始回测' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('行情数据不可用，请改用 CSV。')
    expect(screen.getByLabelText('股票代码')).toHaveValue('MSFT')
  })

  it('debounces parameter changes and reuses the loaded dataset', async () => {
    const user = userEvent.setup()
    render(<BacktestForm strategies={catalogFixture} onRun={vi.fn()} />)
    await loadMarketData()

    await user.click(screen.getByRole('button', { name: '均线交叉' }))
    fireEvent.change(screen.getByLabelText('短均线周期滑块'), { target: { value: '25' } })

    await waitFor(() => expect(runBacktestForDatasetMock).toHaveBeenCalledTimes(2), { timeout: 1000 })
    expect(previewMarketDataMock).toHaveBeenCalledTimes(1)
    expect(runBacktestForDatasetMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ strategyKey: 'sma_cross', params: { short_window: 25, long_window: 50 } }),
      'dataset-42',
      expect.any(AbortSignal),
    )
  })

  it('aborts a stale automatic run and only publishes the latest result', async () => {
    const user = userEvent.setup()
    const onRun = vi.fn()
    render(<BacktestForm strategies={catalogFixture} onRun={onRun} />)
    await loadMarketData()
    onRun.mockClear()
    await user.click(screen.getByRole('button', { name: '均线交叉' }))
    await waitFor(() => expect(runBacktestForDatasetMock).toHaveBeenCalledTimes(2), { timeout: 1000 })
    await waitFor(() => expect(onRun).toHaveBeenCalledTimes(1))
    onRun.mockClear()

    const stale = deferred<BacktestResponse>()
    const latest = deferred<BacktestResponse>()
    runBacktestForDatasetMock.mockReturnValueOnce(stale.promise).mockReturnValueOnce(latest.promise)
    fireEvent.change(screen.getByLabelText('短均线周期滑块'), { target: { value: '25' } })
    await waitFor(() => expect(runBacktestForDatasetMock).toHaveBeenCalledTimes(3), { timeout: 1000 })
    const staleSignal = runBacktestForDatasetMock.mock.calls[2][2] as AbortSignal

    fireEvent.change(screen.getByLabelText('短均线周期滑块'), { target: { value: '30' } })
    await waitFor(() => expect(runBacktestForDatasetMock).toHaveBeenCalledTimes(4), { timeout: 1000 })
    expect(staleSignal.aborted).toBe(true)

    await act(async () => stale.resolve(successfulResult))
    expect(onRun).not.toHaveBeenCalled()
    const latestResult = { ...successfulResult, metadata: { ...successfulResult.metadata, strategyKey: 'sma_cross' } }
    await act(async () => latest.resolve(latestResult))
    await waitFor(() => expect(onRun).toHaveBeenCalledWith(latestResult))
  })

  it('invalidates loaded data when a market-data field changes', async () => {
    const user = userEvent.setup()
    render(<BacktestForm strategies={catalogFixture} onRun={vi.fn()} />)
    await loadMarketData()

    await user.clear(screen.getByLabelText('股票代码'))
    await user.type(screen.getByLabelText('股票代码'), 'AAPL')

    expect(await screen.findByRole('button', { name: '加载行情并开始回测' })).toBeVisible()
    expect(previewMarketDataMock).toHaveBeenCalledTimes(1)
    expect(runBacktestForDatasetMock).toHaveBeenCalledTimes(1)
  })
})
