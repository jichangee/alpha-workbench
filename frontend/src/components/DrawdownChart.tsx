import { useEffect, useRef } from 'react'
import { LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { init, use } from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import type { BacktestResponse } from '../types'

use([LineChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer])

interface DrawdownChartProps {
  result: BacktestResponse
}

export function DrawdownChart({ result }: DrawdownChartProps) {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!container.current) return
    const chart = init(container.current, undefined, { renderer: 'svg' })
    const resize = () => chart.resize()
    const resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resize)
    resizeObserver?.observe(container.current)
    window.addEventListener('resize', resize)
    chart.setOption({
      animation: false,
      color: ['#c6534a', '#97a9b5'],
      grid: { left: 54, right: 20, top: 44, bottom: 34 },
      legend: { top: 8, data: ['策略回撤', '基准回撤'] },
      tooltip: { trigger: 'axis', valueFormatter: (value: string | number) => `${(Number(value) * 100).toFixed(2)}%` },
      xAxis: { type: 'category', data: result.series.dates, boundaryGap: false, axisLabel: { hideOverlap: true } },
      yAxis: { type: 'value', max: 0, axisLabel: { formatter: (value: number) => `${(value * 100).toFixed(0)}%` } },
      series: [
        { name: '策略回撤', type: 'line', data: result.series.drawdown, showSymbol: false, areaStyle: { opacity: 0.28 } },
        { name: '基准回撤', type: 'line', data: result.series.benchmarkDrawdown, showSymbol: false, lineStyle: { type: 'dashed' } },
      ],
    })
    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', resize)
      chart.dispose()
    }
  }, [result])

  return <div className="chart-canvas" ref={container} role="img" aria-label="策略及基准回撤走势" />
}
