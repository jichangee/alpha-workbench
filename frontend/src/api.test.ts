import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { previewMarketData, runBacktest, runBacktestForDataset } from './api'
import type { BacktestResponse, FormState } from './types'

const yahooInput: FormState = {
  source: 'yahoo',
  symbol: 'MSFT',
  start: '2021-01-01',
  end: '2021-12-31',
  file: null,
  strategyKey: 'sma_cross',
  params: { short_window: 20, long_window: 50 },
  initialCash: 125000,
  commission: 1.25,
  slippageBps: 7,
}

const backtestFixture: BacktestResponse = {
  metadata: { datasetId: 'dataset-42', strategyKey: 'sma_cross', start: '2021-01-01', end: '2021-12-31', execution: 'next_open', warmup: 50, initialCash: 125000, commission: 1.25, slippageBps: 7 },
  metrics: { endingEquity: 130000, totalReturn: 0.04, cagr: 0.04, annualizedVolatility: 0.2, sharpeRatio: 0.5, maxDrawdown: -0.1, tradeCount: 2, winRate: 0.5 },
  series: { dates: ['2021-01-01'], open: [100], high: [101], low: [99], close: [100], cash: [0], shares: [1], holdings: [100], equity: [100], strategy: [1], benchmark: [1], drawdown: [0], benchmarkDrawdown: [0] },
  indicators: {}, fills: [], trades: [], warnings: [],
}

function jsonResponse(body: unknown): Response {
  return { ok: true, json: vi.fn().mockResolvedValue(body) } as unknown as Response
}

describe('backtest API workflow', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('loads Yahoo data before posting camelCase backtest fields with the returned datasetId', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ datasetId: 'dataset-42', symbol: 'MSFT', start: '2021-01-01', end: '2021-12-31', rows: 252, preview: [], warnings: [] }))
    fetchMock.mockResolvedValueOnce(jsonResponse(backtestFixture))

    await expect(runBacktest(yahooInput)).resolves.toEqual(backtestFixture)

    const [previewPath, previewRequest] = fetchMock.mock.calls[0]
    expect(previewPath).toBe('/api/market-data/preview')
    expect((previewRequest.body as FormData).get('source')).toBe('yahoo')
    expect((previewRequest.body as FormData).get('symbol')).toBe('MSFT')
    expect((previewRequest.body as FormData).get('start')).toBe('2021-01-01')
    expect(fetchMock.mock.calls[1]).toEqual([
      '/api/backtests',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          datasetId: 'dataset-42',
          strategy: { key: 'sma_cross', params: { short_window: 20, long_window: 50 } },
          initialCash: 125000,
          commission: 1.25,
          slippageBps: 7,
        }),
      }),
    ])
  })

  it('sends a selected CSV File in preview FormData', async () => {
    const file = new File(['Date,Open,High,Low,Close\n2021-01-01,1,1,1,1'], 'spy.csv', { type: 'text/csv' })
    fetchMock.mockResolvedValueOnce(jsonResponse({ datasetId: 'dataset-csv', symbol: 'SPY', start: '2021-01-01', end: '2021-01-01', rows: 1, preview: [], warnings: [] }))

    await previewMarketData({ ...yahooInput, source: 'csv', file, symbol: 'SPY' })

    const formData = fetchMock.mock.calls[0][1].body as FormData
    expect(formData.get('source')).toBe('csv')
    expect(formData.get('file')).toBe(file)
  })

  it('runs a backtest against an existing dataset without loading market data again', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(backtestFixture))

    await expect(runBacktestForDataset(yahooInput, 'dataset-42')).resolves.toEqual(backtestFixture)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/backtests', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        datasetId: 'dataset-42',
        strategy: { key: 'sma_cross', params: { short_window: 20, long_window: 50 } },
        initialCash: 125000,
        commission: 1.25,
        slippageBps: 7,
      }),
    }))
  })
})
