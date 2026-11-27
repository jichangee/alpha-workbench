import { describe, expect, it, vi } from 'vitest'

const { connect } = vi.hoisted(() => ({ connect: vi.fn() }))

vi.mock('echarts/core', () => ({ connect }))

import { BACKTEST_CHART_GROUP, attachChartGroup } from './chartSync'

describe('chart date synchronization', () => {
  it('joins charts to one ECharts interaction group', () => {
    const chart = { group: '' }

    attachChartGroup(chart)

    expect(chart.group).toBe(BACKTEST_CHART_GROUP)
    expect(connect).toHaveBeenCalledWith(BACKTEST_CHART_GROUP)
  })
})
