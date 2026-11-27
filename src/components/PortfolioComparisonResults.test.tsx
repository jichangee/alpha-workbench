import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PortfolioComparisonResponse } from '../types'
import { comparisonResultFixture, threePortfolioResultFixture } from '../portfolioComparisonFixture'
import { PortfolioComparisonResults } from './PortfolioComparisonResults'

const setOptionMock = vi.hoisted(() => vi.fn())

vi.mock('echarts/core', () => ({
  init: () => ({ dispose: vi.fn(), resize: vi.fn(), setOption: setOptionMock }),
  use: vi.fn(),
}))

describe('PortfolioComparisonResults', () => {
  it('defers the chart bundle behind a loading boundary', () => {
    render(<PortfolioComparisonResults result={comparisonResultFixture} />)

    expect(screen.getByRole('status')).toHaveTextContent('正在加载走势图…')
  })

  it('renders both portfolios, compositions, dates, and comparison metrics', () => {
    render(<PortfolioComparisonResults result={comparisonResultFixture} />)

    expect(screen.getByRole('region', { name: '持仓对比结果' })).toBeVisible()
    expect(screen.getAllByText('持仓 1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('持仓 2').length).toBeGreaterThan(0)
    expect(screen.getByText('VOO 50%')).toBeVisible()
    expect(screen.getByText('QQQ 50%')).toBeVisible()
    expect(screen.getByText('SOXX 100%')).toBeVisible()
    expect(screen.getByText('每月再平衡')).toBeVisible()
    expect(screen.getByText('2 次再平衡')).toBeVisible()
    expect(screen.getByText('2021-01-04 至 2025-12-31 · 2 个共同交易日')).toBeVisible()
    expect(screen.getByRole('rowheader', { name: '累计收益' })).toBeVisible()
    expect(screen.getByRole('rowheader', { name: '年化收益' })).toBeVisible()
    expect(screen.getByRole('rowheader', { name: '年化波动率' })).toBeVisible()
    expect(screen.getByRole('rowheader', { name: '夏普比率' })).toBeVisible()
    expect(screen.getByRole('rowheader', { name: '最大回撤' })).toBeVisible()
    expect(screen.getByRole('cell', { name: '+50.00%' })).toBeVisible()
    expect(screen.getByRole('cell', { name: '-32.00%' })).toBeVisible()
    expect(screen.getByRole('cell', { name: '0.53' })).toBeVisible()
  })

  it('shows a dash for unavailable metrics', () => {
    const result: PortfolioComparisonResponse = {
      ...comparisonResultFixture,
      portfolios: [
        { ...comparisonResultFixture.portfolios[0], metrics: { ...comparisonResultFixture.portfolios[0].metrics, cagr: null } },
        comparisonResultFixture.portfolios[1],
      ],
    }

    render(<PortfolioComparisonResults result={result} />)

    expect(screen.getByRole('rowheader', { name: '年化收益' }).closest('tr')).toHaveTextContent('—')
  })

  it('describes and renders a third portfolio throughout the results', async () => {
    render(<PortfolioComparisonResults result={threePortfolioResultFixture} />)

    expect(screen.getByText('AAPL 100%')).toBeVisible()
    expect(screen.getByRole('columnheader', { name: '持仓 3' })).toBeVisible()
    expect(screen.getByText('各组起点均为 100，按各自策略管理目标权重。')).toBeVisible()
    expect(await screen.findByRole('img', { name: '持仓 1、持仓 2、持仓 3的归一化净值走势' })).toBeVisible()
  })

  it('configures five distinct chart colors and one series per portfolio', async () => {
    setOptionMock.mockClear()
    render(<PortfolioComparisonResults result={threePortfolioResultFixture} />)
    await screen.findByRole('img')

    expect(setOptionMock).toHaveBeenCalledWith(expect.objectContaining({
      color: ['#087d74', '#e0773c', '#4169a1', '#9a5f9e', '#b58a28'],
      series: [
        expect.objectContaining({ name: '持仓 1', lineStyle: expect.objectContaining({ type: 'solid' }) }),
        expect.objectContaining({ name: '持仓 2', lineStyle: expect.objectContaining({ type: 'dashed' }) }),
        expect.objectContaining({ name: '持仓 3', lineStyle: expect.objectContaining({ type: 'dotted' }) }),
      ],
    }))
  })

  it('marks each portfolio actual rebalance dates on its own equity line', async () => {
    setOptionMock.mockClear()
    const result: PortfolioComparisonResponse = {
      ...comparisonResultFixture,
      dates: ['2021-01-04', '2021-01-29', '2021-02-12', '2021-02-26'],
      portfolios: [
        {
          ...comparisonResultFixture.portfolios[0],
          rebalanceDates: ['2021-01-29', '2021-02-12', '2021-02-26', '2099-01-01'],
          equity: [100, 102.25, Number.NaN, 104.5],
        },
        {
          ...comparisonResultFixture.portfolios[1],
          rebalanceDates: [],
          equity: [100, 101, 102, 103],
        },
      ],
    }

    render(<PortfolioComparisonResults result={result} />)
    await screen.findByRole('img')

    type MarkPointData = { name: string; value: number; coord: [string, number] }
    type ChartSeries = {
      name: string
      markPoint?: {
        label: { show: boolean }
        data: MarkPointData[]
        tooltip: { formatter: (parameters: { data: MarkPointData }) => string }
      }
    }
    const option = setOptionMock.mock.calls.at(-1)?.[0] as { series: ChartSeries[] }
    const firstMarkPoint = option.series[0].markPoint

    expect(firstMarkPoint?.data).toEqual([
      { name: '再平衡', value: 102.25, coord: ['2021-01-29', 102.25] },
      { name: '再平衡', value: 104.5, coord: ['2021-02-26', 104.5] },
    ])
    expect(firstMarkPoint?.label.show).toBe(false)
    expect(firstMarkPoint?.tooltip.formatter({
      data: firstMarkPoint.data[0],
    })).toBe('持仓 1<br/>再平衡 · 2021-01-29<br/>净值 102.25')
    expect(option.series[1].markPoint?.data).toEqual([])
  })

  it('marks the peak-to-trough interval for each portfolio maximum drawdown', async () => {
    setOptionMock.mockClear()
    const result: PortfolioComparisonResponse = {
      ...comparisonResultFixture,
      dates: ['2021-01-04', '2021-01-29', '2021-02-12', '2021-02-26', '2021-03-12', '2021-03-26'],
      portfolios: [
        {
          ...comparisonResultFixture.portfolios[0],
          rebalanceDates: [],
          equity: [100, 130, 104, 118, 90, 120],
        },
        {
          ...comparisonResultFixture.portfolios[1],
          rebalanceDates: [],
          equity: [100, 101, 102, 103, 104, 105],
        },
      ],
    }

    render(<PortfolioComparisonResults result={result} />)
    await screen.findByRole('img')

    type MarkPointData = { name: string; value: number; coord: [string, number]; symbol?: string }
    type ChartSeries = {
      markPoint?: {
        data: MarkPointData[]
        tooltip: { formatter: (parameters: { data: MarkPointData }) => string }
      }
    }
    const option = setOptionMock.mock.calls.at(-1)?.[0] as { series: ChartSeries[] }
    const firstMarkPoint = option.series[0].markPoint

    expect(firstMarkPoint?.data).toEqual([
      { name: '最大回撤起点', value: 130, coord: ['2021-01-29', 130], symbol: 'diamond' },
      { name: '最大回撤终点', value: 90, coord: ['2021-03-12', 90], symbol: 'pin' },
    ])
    expect(firstMarkPoint?.tooltip.formatter({ data: firstMarkPoint.data[1] }))
      .toBe('持仓 1<br/>最大回撤 · 2021-01-29 → 2021-03-12<br/>-30.77%')
    expect(option.series[1].markPoint?.data).toEqual([])
  })
})
