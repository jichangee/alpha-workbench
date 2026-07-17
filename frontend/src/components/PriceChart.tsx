import { useEffect, useRef } from 'react'
import { CandlestickChart, LineChart } from 'echarts/charts'
import { DataZoomComponent, GridComponent, LegendComponent, MarkPointComponent, TooltipComponent } from 'echarts/components'
import { init, use } from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import { indicatorLabel } from '../displayLabels'
import type { BacktestResponse } from '../types'
import { attachChartGroup } from './chartSync'

use([
  CandlestickChart,
  LineChart,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkPointComponent,
  TooltipComponent,
  SVGRenderer,
])

interface PriceChartProps {
  result: BacktestResponse
}

export function buildPriceOption(result: BacktestResponse) {
  const hasRsi = Object.hasOwn(result.indicators, 'rsi')
  const indicatorSeries = Object.entries(result.indicators).map(([key, values]) => ({
    name: indicatorLabel(key),
    type: 'line' as const,
    data: values,
    yAxisIndex: key === 'rsi' ? 1 : 0,
    showSymbol: false,
    smooth: true,
    lineStyle: { width: 1.5 },
  }))
  return {
    animation: false,
    color: ['#3877a8', '#c78a28', '#805ad5', '#b55b4a'],
    grid: { left: 54, right: 20, top: 44, bottom: 34 },
    legend: { top: 8, type: 'scroll', data: ['价格', ...Object.keys(result.indicators).map(indicatorLabel)] },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: result.series.dates, axisLabel: { hideOverlap: true } },
    yAxis: [
      { type: 'value', scale: true },
      ...(hasRsi ? [{ type: 'value' as const, min: 0, max: 100, position: 'right' as const }] : []),
    ],
    dataZoom: [{ type: 'inside' as const, xAxisIndex: 0 }],
    series: [
      {
        name: '价格',
        type: 'candlestick',
        data: result.series.dates.map((_, index) => [result.series.open[index], result.series.close[index], result.series.low[index], result.series.high[index]]),
        itemStyle: { color: '#087d74', color0: '#c6534a', borderColor: '#087d74', borderColor0: '#c6534a' },
        markPoint: {
          symbolSize: 32,
          data: result.fills.map((fill) => ({
            coord: [fill.date, fill.price],
            value: fill.side === 'buy' ? '买' : '卖',
            itemStyle: { color: fill.side === 'buy' ? '#087d74' : '#c6534a' },
            label: { color: '#fff', fontWeight: 'bold' },
          })),
        },
      },
      ...indicatorSeries,
    ],
  }
}

export function PriceChart({ result }: PriceChartProps) {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!container.current) return
    const chart = init(container.current, undefined, { renderer: 'svg' })
    attachChartGroup(chart)
    const resize = () => chart.resize()
    const resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resize)
    resizeObserver?.observe(container.current)
    window.addEventListener('resize', resize)
    chart.setOption(buildPriceOption(result))
    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', resize)
      chart.dispose()
    }
  }, [result])

  const labels = Object.keys(result.indicators).map(indicatorLabel)
  return (
    <div>
      {labels.length > 0 && <p className="chart-legend indicator-legend" aria-hidden="true">{labels.map((label) => <span key={label}>{label}</span>)}</p>}
      <div className="chart-canvas" ref={container} role="img" aria-label="价格、技术指标及交易成交标记" />
    </div>
  )
}
