import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { init } from 'echarts/core'
import { buildDrawdownOption } from './DrawdownChart'
import { buildPriceOption } from './PriceChart'
import type { BacktestResponse } from '../types'

const result: BacktestResponse = {
  metadata: { datasetId: 'chart-test', strategyKey: 'sma_cross', start: '2024-01-02', end: '2024-01-03', execution: 'next_open', warmup: 20, initialCash: 10000, commission: 1, slippageBps: 5 },
  metrics: { endingEquity: 10100, totalReturn: 0.01, cagr: 0.01, annualizedVolatility: 0.1, sharpeRatio: 0.5, maxDrawdown: -0.02, tradeCount: 1, winRate: 1 },
  series: { dates: ['2024-01-02', '2024-01-03'], open: [100, 101], high: [103, 104], low: [99, 98], close: [102, 100], cash: [0, 0], shares: [10, 10], holdings: [1020, 1000], equity: [10000, 10100], strategy: [1, 1.01], benchmark: [1, 1.02], drawdown: [0, -0.02], benchmarkDrawdown: [0, -0.01] },
  indicators: { short_sma: [100, 101] },
  fills: [{ date: '2024-01-02', side: 'buy', price: 100, shares: 10, commission: 1, notional: 1000 }, { date: '2024-01-03', side: 'sell', price: 101, shares: 10, commission: 1, notional: 1010 }],
  trades: [], warnings: [],
}

const originalGetContext = HTMLCanvasElement.prototype.getContext

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => ({
    measureText: (text: string) => ({ width: text.length * 8 }),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext
})

afterAll(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext
})

describe('chart option builders', () => {
  it('builds OHLC candles, indicators, and buy/sell fill markers from result data', () => {
    const option = buildPriceOption(result)
    const series = option.series as Array<{ name: string; data: unknown; markPoint?: { data: Array<{ value: string; coord: unknown }> } }>

    expect(series[0].data).toEqual([[100, 102, 99, 103], [101, 100, 98, 104]])
    expect(series).toEqual(expect.arrayContaining([expect.objectContaining({ name: '短期均线', data: [100, 101] })]))
    expect(series[0].markPoint?.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: '买', coord: ['2024-01-02', 100] }),
      expect.objectContaining({ value: '卖', coord: ['2024-01-03', 101] }),
    ]))
  })

  it('registers mark points with modular ECharts so fill labels really render', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const chart = init(container, undefined, { renderer: 'svg', width: 600, height: 320 })

    chart.setOption(buildPriceOption(result))

    expect(container.innerHTML).toContain('买')
    expect(container.innerHTML).toContain('卖')
    chart.dispose()
    container.remove()
  })

  it('places RSI on a bounded secondary axis without changing the price axis scale', () => {
    const option = buildPriceOption({
      ...result,
      indicators: { rsi: [25, 75], short_sma: [100, 101] },
    })
    const axes = option.yAxis as Array<{ scale?: boolean; min?: number; max?: number }>
    const series = option.series as Array<{ name: string; yAxisIndex?: number }>

    expect(axes[0]).toEqual(expect.objectContaining({ scale: true }))
    expect(axes[1]).toEqual(expect.objectContaining({ min: 0, max: 100 }))
    expect(series.find((item) => item.name === 'RSI')).toEqual(expect.objectContaining({ yAxisIndex: 1 }))
    expect(series.find((item) => item.name === '短期均线')).toEqual(expect.objectContaining({ yAxisIndex: 0 }))
  })

  it('adds inside zoom for long date ranges', () => {
    const option = buildPriceOption(result)

    expect(option.dataZoom).toEqual([
      expect.objectContaining({ type: 'inside', xAxisIndex: 0 }),
    ])
  })

  it('builds a negative drawdown area series', () => {
    const option = buildDrawdownOption(result)
    const series = option.series as Array<{ name: string; data: unknown; areaStyle?: unknown }>

    expect(series).toEqual(expect.arrayContaining([expect.objectContaining({ name: '策略回撤', data: [0, -0.02], areaStyle: expect.any(Object) })]))
  })
})
