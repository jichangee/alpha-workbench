import { useEffect, useRef } from 'react'
import { LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, MarkPointComponent, TooltipComponent } from 'echarts/components'
import { init, use } from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import { useI18n } from '../i18n'
import type { PortfolioComparisonResponse } from '../types'

use([LineChart, GridComponent, LegendComponent, MarkPointComponent, TooltipComponent, SVGRenderer])

const portfolioColors = ['#087d74', '#e0773c', '#4169a1', '#9a5f9e', '#b58a28']
const portfolioLineStyles = ['solid', 'dashed', 'dotted']

interface PortfolioComparisonChartProps {
  result: PortfolioComparisonResponse
}

interface RebalanceMarkPoint {
  name: string
  value: number
  coord: [string, number]
}

interface MaximumDrawdown {
  peakDate: string
  peakEquity: number
  troughDate: string
  troughEquity: number
  percentage: number
}

interface DrawdownMarkPoint {
  name: string
  value: number
  coord: [string, number]
  symbol: 'diamond' | 'pin'
}

function findMaximumDrawdown(dates: string[], equity: number[]): MaximumDrawdown | undefined {
  let peakDate: string | undefined
  let peakEquity = Number.NEGATIVE_INFINITY
  let maximumDrawdown: MaximumDrawdown | undefined

  equity.forEach((value, index) => {
    const date = dates[index]
    if (!date || !Number.isFinite(value)) return

    if (value > peakEquity) {
      peakEquity = value
      peakDate = date
      return
    }

    if (!peakDate || peakEquity <= 0) return
    const percentage = value / peakEquity - 1
    if (percentage < 0 && (!maximumDrawdown || percentage < maximumDrawdown.percentage)) {
      maximumDrawdown = { peakDate, peakEquity, troughDate: date, troughEquity: value, percentage }
    }
  })

  return maximumDrawdown
}

export function PortfolioComparisonChart({ result }: PortfolioComparisonChartProps) {
  const { locale } = useI18n()
  const isEn = locale === 'en'
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!container.current) return
    const chart = init(container.current, undefined, { renderer: 'svg' })
    const resize = () => chart.resize()
    const resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resize)
    resizeObserver?.observe(container.current)
    window.addEventListener('resize', resize)
    const dateIndexes = new Map(result.dates.map((date, index) => [date, index]))
    chart.setOption({
      animation: false,
      color: portfolioColors,
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
        name: isEn ? 'Base = 100' : '初始值 = 100',
        axisLabel: { formatter: (value: number) => value.toFixed(0) },
      },
      series: result.portfolios.map((portfolio, index) => {
        const rebalancePoints = portfolio.rebalanceDates.flatMap<RebalanceMarkPoint>((date) => {
          const dateIndex = dateIndexes.get(date)
          if (dateIndex === undefined) return []
          const equity = portfolio.equity[dateIndex]
          if (!Number.isFinite(equity)) return []
          return [{ name: isEn ? 'Rebalance' : '再平衡', value: equity, coord: [date, equity] }]
        })
        const maximumDrawdown = findMaximumDrawdown(result.dates, portfolio.equity)
        const peakName = isEn ? 'Drawdown Peak' : '最大回撤起点'
        const troughName = isEn ? 'Drawdown Trough' : '最大回撤终点'
        const drawdownPoints: DrawdownMarkPoint[] = maximumDrawdown
          ? [
              {
                name: peakName,
                value: maximumDrawdown.peakEquity,
                coord: [maximumDrawdown.peakDate, maximumDrawdown.peakEquity],
                symbol: 'diamond',
              },
              {
                name: troughName,
                value: maximumDrawdown.troughEquity,
                coord: [maximumDrawdown.troughDate, maximumDrawdown.troughEquity],
                symbol: 'pin',
              },
            ]
          : []

        return {
          name: portfolio.name,
          type: 'line',
          data: portfolio.equity,
          showSymbol: false,
          lineStyle: { width: 2.5, type: portfolioLineStyles[index % portfolioLineStyles.length] },
          markPoint: {
            symbol: 'circle',
            symbolSize: 8,
            label: { show: false },
            itemStyle: {
              color: portfolioColors[index % portfolioColors.length],
              borderColor: '#ffffff',
              borderWidth: 1.5,
            },
            tooltip: {
              formatter: ({ data }: { data: RebalanceMarkPoint | DrawdownMarkPoint }) => {
                if (data.name === troughName && maximumDrawdown) {
                  return isEn
                    ? `${portfolio.name}<br/>Max Drawdown · ${maximumDrawdown.peakDate} → ${maximumDrawdown.troughDate}<br/>${(maximumDrawdown.percentage * 100).toFixed(2)}%`
                    : `${portfolio.name}<br/>最大回撤 · ${maximumDrawdown.peakDate} → ${maximumDrawdown.troughDate}<br/>${(maximumDrawdown.percentage * 100).toFixed(2)}%`
                }
                if (data.name === peakName) {
                  return isEn
                    ? `${portfolio.name}<br/>Drawdown Peak · ${data.coord[0]}<br/>Equity ${data.value.toFixed(2)}`
                    : `${portfolio.name}<br/>最大回撤起点 · ${data.coord[0]}<br/>净值 ${data.value.toFixed(2)}`
                }
                return isEn
                  ? `${portfolio.name}<br/>Rebalance · ${data.coord[0]}<br/>Equity ${data.value.toFixed(2)}`
                  : `${portfolio.name}<br/>再平衡 · ${data.coord[0]}<br/>净值 ${data.value.toFixed(2)}`
              },
            },
            data: [...rebalancePoints, ...drawdownPoints],
          },
        }
      }),
    })

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', resize)
      chart.dispose()
    }
  }, [isEn, result])

  return (
    <div
      className="portfolio-chart-canvas"
      ref={container}
      role="img"
      aria-label={isEn
        ? `Normalized equity curves for ${result.portfolios.map((portfolio) => portfolio.name).join(', ')}`
        : `${result.portfolios.map((portfolio) => portfolio.name).join('、')}的归一化净值走势`}
    />
  )
}
