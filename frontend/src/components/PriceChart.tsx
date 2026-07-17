import { useEffect, useRef } from 'react'
import { CandlestickChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { init, use } from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import type { BacktestResponse } from '../types'

use([CandlestickChart, LineChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer])

interface PriceChartProps {
  result: BacktestResponse
}

export function buildPriceOption(result: BacktestResponse) {
  const indicatorSeries = Object.entries(result.indicators).map(([name, values]) => ({
    name,
    type: 'line' as const,
    data: values,
    showSymbol: false,
    smooth: true,
    lineStyle: { width: 1.5 },
  }))
  return {
    animation: false,
    color: ['#3877a8', '#c78a28', '#805ad5', '#b55b4a'],
    grid: { left: 54, right: 20, top: 44, bottom: 34 },
    legend: { top: 8, type: 'scroll', data: ['价格', ...Object.keys(result.indicators)] },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: result.series.dates, axisLabel: { hideOverlap: true } },
    yAxis: { type: 'value', scale: true },
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

  return <div className="chart-canvas" ref={container} role="img" aria-label="价格、技术指标及交易成交标记" />
}
