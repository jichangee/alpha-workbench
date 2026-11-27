import { useEffect, useRef } from 'react'
import { LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { init, use } from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import { useI18n } from '../i18n'
import type { BacktestResponse } from '../types'
import { attachChartGroup } from './chartSync'

use([LineChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer])

interface EquityChartProps {
  result: BacktestResponse
}

function normalize(values: Array<number | null>): Array<number | null> {
  const base = values.find((value): value is number => value !== null && Number.isFinite(value))
  return base === undefined || base === 0 ? values : values.map((value) => value === null ? null : value / base)
}

export function EquityChart({ result }: EquityChartProps) {
  const { locale } = useI18n()
  const isEn = locale === 'en'
  const strategyLabel = isEn ? 'Strategy Equity' : '策略净值'
  const benchmarkLabel = isEn ? 'Buy & Hold Benchmark' : '买入并持有基准'
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!container.current) return
    const chart = init(container.current, undefined, { renderer: 'svg' })
    attachChartGroup(chart)
    const resize = () => chart.resize()
    const resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resize)
    resizeObserver?.observe(container.current)
    window.addEventListener('resize', resize)
    chart.setOption({
      animation: false,
      color: ['#087d74', '#687b8b'],
      grid: { left: 54, right: 20, top: 44, bottom: 34 },
      legend: { top: 8, data: [strategyLabel, benchmarkLabel] },
      tooltip: { trigger: 'axis', valueFormatter: (value: string | number) => Number(value).toFixed(4) },
      xAxis: { type: 'category', data: result.series.dates, boundaryGap: false, axisLabel: { hideOverlap: true } },
      yAxis: { type: 'value', scale: true, axisLabel: { formatter: (value: number) => value.toFixed(2) } },
      series: [
        { name: strategyLabel, type: 'line', data: normalize(result.series.strategy), showSymbol: false, lineStyle: { width: 2 } },
        { name: benchmarkLabel, type: 'line', data: normalize(result.series.benchmark), showSymbol: false, lineStyle: { width: 2, type: 'dashed' } },
      ],
    })
    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', resize)
      chart.dispose()
    }
  }, [benchmarkLabel, result, strategyLabel])

  return (
    <div>
      <p className="chart-legend" aria-hidden="true"><span>{strategyLabel}</span><span>{benchmarkLabel}</span></p>
      <div className="chart-canvas" ref={container} role="img" aria-label={isEn ? 'Strategy equity vs Buy & Hold benchmark' : '策略净值与买入并持有基准走势'} />
    </div>
  )
}
