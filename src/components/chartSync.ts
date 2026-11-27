import { connect } from 'echarts/core'

export const BACKTEST_CHART_GROUP = 'backtest-date-sync'

interface GroupableChart {
  group: string
}

export function attachChartGroup(chart: GroupableChart) {
  chart.group = BACKTEST_CHART_GROUP
  connect(BACKTEST_CHART_GROUP)
}
