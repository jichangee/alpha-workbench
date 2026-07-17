import { lazy, Suspense, useState } from 'react'
import { MetricCards } from './MetricCards'
import { TradesTable } from './TradesTable'
import type { BacktestResponse } from '../types'

const EquityChart = lazy(() => import('./EquityChart').then(({ EquityChart: component }) => ({ default: component })))
const PriceChart = lazy(() => import('./PriceChart').then(({ PriceChart: component }) => ({ default: component })))
const DrawdownChart = lazy(() => import('./DrawdownChart').then(({ DrawdownChart: component }) => ({ default: component })))

interface ResultsDashboardProps {
  result: BacktestResponse
}

type DashboardTab = 'equity' | 'price' | 'drawdown'

export function ResultsDashboard({ result }: ResultsDashboardProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('equity')
  const tabs: Array<{ id: DashboardTab; label: string }> = [
    { id: 'equity', label: '绩效走势' },
    { id: 'price', label: '价格与信号' },
    { id: 'drawdown', label: '风险回撤' },
  ]
  const title = tabs.find((tab) => tab.id === activeTab)?.label

  return (
    <section className="results-dashboard" aria-label="回测结果">
      <header className="results-heading">
        <div><p className="eyebrow">BACKTEST RESULTS</p><h2>{result.metadata.strategyKey} 回测结果</h2></div>
        <p>{result.metadata.start} 至 {result.metadata.end} · 次日开盘成交</p>
      </header>
      <MetricCards metrics={result.metrics} />
      {result.warnings.length > 0 && <p className="result-warning" role="status">{result.warnings.join(' ')}</p>}

      <section className="chart-card" aria-labelledby="chart-heading">
        <div className="chart-card-header"><h3 id="chart-heading">{title}</h3><div role="tablist" aria-label="结果图表">
          {tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`${tab.id}-panel`} id={`${tab.id}-tab`} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}
        </div></div>
        <div role="tabpanel" id={`${activeTab}-panel`} aria-labelledby={`${activeTab}-tab`}>
          <Suspense fallback={<p className="chart-loading" role="status">正在加载图表…</p>}>
            {activeTab === 'equity' && <EquityChart result={result} />}
            {activeTab === 'price' && <PriceChart result={result} />}
            {activeTab === 'drawdown' && <DrawdownChart result={result} />}
          </Suspense>
        </div>
      </section>

      <section className="trades-card" aria-labelledby="trades-heading">
        <div><p className="eyebrow">TRADE DETAIL</p><h3 id="trades-heading">交易明细</h3></div>
        <TradesTable trades={result.trades} />
      </section>
    </section>
  )
}
