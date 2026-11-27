import { useEffect, useRef } from 'react'
import { CandlestickChart, LineChart } from 'echarts/charts'
import { DataZoomComponent, GridComponent, LegendComponent, MarkPointComponent, TooltipComponent } from 'echarts/components'
import { init, use } from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import { indicatorLabel } from '../displayLabels'
import { useI18n, type Locale } from '../i18n'
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

export function buildPriceOption(result: BacktestResponse, locale: Locale = 'zh') {
  const isEn = locale === 'en'
  const priceLabel = isEn ? 'Price' : '价格'
  const hasRsi = Object.hasOwn(result.indicators, 'rsi')
  const indicatorSeries = Object.entries(result.indicators).map(([key, values]) => ({
    name: indicatorLabel(key, locale),
    type: 'line' as const,
    data: values,
    yAxisIndex: key === 'rsi' ? 1 : 0,
    showSymbol: false,
    smooth: true,
    lineStyle: { width: 1.5 },
  }))
  const primaryFills = result.metadata.primarySymbol
    ? result.fills.filter((fill) => !fill.symbol || fill.symbol === result.metadata.primarySymbol)
    : result.fills
  return {
    animation: false,
    color: ['#3877a8', '#c78a28', '#805ad5', '#b55b4a'],
    grid: { left: 54, right: 20, top: 44, bottom: 34 },
    legend: { top: 8, type: 'scroll', data: [priceLabel, ...Object.keys(result.indicators).map((key) => indicatorLabel(key, locale))] },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: result.series.dates, axisLabel: { hideOverlap: true } },
    yAxis: [
      { type: 'value', scale: true },
      ...(hasRsi ? [{ type: 'value' as const, min: 0, max: 100, position: 'right' as const }] : []),
    ],
    dataZoom: [{ type: 'inside' as const, xAxisIndex: 0 }],
    series: [
      {
        name: priceLabel,
        type: 'candlestick',
        data: result.series.dates.map((_, index) => [result.series.open[index], result.series.close[index], result.series.low[index], result.series.high[index]]),
        itemStyle: { color: '#087d74', color0: '#c6534a', borderColor: '#087d74', borderColor0: '#c6534a' },
        markPoint: {
          symbolSize: 32,
          data: primaryFills.map((fill) => ({
            coord: [fill.date, fill.price],
            value: fill.side === 'buy' ? (isEn ? 'B' : '买') : (isEn ? 'S' : '卖'),
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
  const { locale } = useI18n()
  const isEn = locale === 'en'
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!container.current) return
    const chart = init(container.current, undefined, { renderer: 'svg' })
    attachChartGroup(chart)
    const resize = () => chart.resize()
    const resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resize)
    resizeObserver?.observe(container.current)
    window.addEventListener('resize', resize)
    chart.setOption(buildPriceOption(result, locale))
    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', resize)
      chart.dispose()
    }
  }, [locale, result])

  const labels = Object.keys(result.indicators).map((key) => indicatorLabel(key, locale))
  return (
    <div>
      {labels.length > 0 && <p className="chart-legend indicator-legend" aria-hidden="true">{labels.map((label) => <span key={label}>{label}</span>)}</p>}
      <div className="chart-canvas" ref={container} role="img" aria-label={isEn ? 'Price, technical indicators, and trade fills' : '价格、技术指标及交易成交标记'} />
    </div>
  )
}
