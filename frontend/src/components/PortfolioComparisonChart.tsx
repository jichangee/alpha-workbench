import { useEffect, useRef } from 'react'
import { LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { init, use } from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import type { PortfolioComparisonResponse } from '../types'

use([LineChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer])

interface PortfolioComparisonChartProps {
  result: PortfolioComparisonResponse
}

export function PortfolioComparisonChart({ result }: PortfolioComparisonChartProps) {
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
      color: ['#087d74', '#e0773c'],
      grid: { left: 58, right: 24, top: 48, bottom: 40 },
      legend: { top: 8, data: result.portfolios.map((portfolio) => portfolio.name) },
      tooltip: {
        trigger: 'axis',
        valueFormatter: (value: string | number) => Number(value).toFixed(2),
      },
      xAxis: {
        type: 'category',
        data: result.dates,
        boundaryGap: false,
        axisLabel: { hideOverlap: true },
      },
      yAxis: {
        type: 'value',
        scale: true,
        name: '初始值 = 100',
        axisLabel: { formatter: (value: number) => value.toFixed(0) },
      },
      series: result.portfolios.map((portfolio, index) => ({
        name: portfolio.name,
        type: 'line',
        data: portfolio.equity,
        showSymbol: false,
        lineStyle: { width: 2.5, type: index === 1 ? 'dashed' : 'solid' },
      })),
    })

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', resize)
      chart.dispose()
    }
  }, [result])

  return (
    <div
      className="portfolio-chart-canvas"
      ref={container}
      role="img"
      aria-label={`${result.portfolios[0].name}与${result.portfolios[1].name}的归一化净值走势`}
    />
  )
}
