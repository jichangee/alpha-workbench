import { lazy, Suspense, useState } from 'react'
import { Alert, AlertDescription } from './ui/alert'
import { Badge } from './ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Skeleton } from './ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { strategyLabel } from '../displayLabels'
import { MetricCards } from './MetricCards'
import { TradesTable } from './TradesTable'
import type { BacktestResponse } from '../types'

const EquityChart = lazy(() => import('./EquityChart').then(({ EquityChart: component }) => ({ default: component })))
const PriceChart = lazy(() => import('./PriceChart').then(({ PriceChart: component }) => ({ default: component })))
const DrawdownChart = lazy(() => import('./DrawdownChart').then(({ DrawdownChart: component }) => ({ default: component })))

interface ResultsDashboardProps {
  result: BacktestResponse
}

type DashboardTab = 'equity' | 'price'

export function ResultsDashboard({ result }: ResultsDashboardProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('equity')
  const tabs: Array<{ id: DashboardTab; label: string }> = [
    { id: 'equity', label: '绩效走势' },
    { id: 'price', label: '价格与信号' },
  ]
  const symbolPair = result.metadata.positionMode === 'rotate' && result.metadata.alternateSymbol
    ? `${result.metadata.primarySymbol ?? '主标的'} ↔ ${result.metadata.alternateSymbol}`
    : result.metadata.primarySymbol

  return (
    <section className="min-w-0 space-y-4" aria-label="回测结果">
      <Card>
        <CardHeader className="border-b md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <Badge variant="outline" className="mb-3 border-primary/40 text-primary">BACKTEST RESULTS</Badge>
          <CardTitle className="text-2xl">
            <h2>{strategyLabel(result.metadata.strategyKey)} 回测结果</h2>
          </CardTitle>
          {symbolPair && <p className="mt-2 font-mono text-xs font-semibold text-primary">{symbolPair}</p>}
        </div>
        <CardDescription className="mt-3 md:mt-0 md:text-right">
          {result.metadata.start} 至 {result.metadata.end}<br />
          首日开盘建仓 · 后续次日开盘调仓
        </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <MetricCards metrics={result.metrics} />
          {result.warnings.length > 0 && (
            <Alert className="border-amber-500/30 bg-amber-500/5" role="status">
              <AlertDescription className="text-amber-700">{result.warnings.join(' ')}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as DashboardTab)}>
        <Card>
          <CardHeader className="border-b md:grid-cols-[1fr_auto] md:items-center">
            <CardTitle>表现分析</CardTitle>
            <TabsList aria-label="结果图表" className="mt-3 w-full md:mt-0 md:w-auto">
              {tabs.map((tab) => <TabsTrigger key={tab.id} value={tab.id}>{tab.label}</TabsTrigger>)}
            </TabsList>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-[320px] w-full" role="status" aria-label="正在加载图表…" />}>
              <TabsContent value="equity"><EquityChart result={result} /></TabsContent>
              <TabsContent value="price"><PriceChart result={result} /></TabsContent>
            </Suspense>
          </CardContent>
        </Card>
      </Tabs>

      <Card aria-labelledby="drawdown-heading">
        <CardHeader className="border-b">
          <CardTitle id="drawdown-heading">风险回撤</CardTitle>
          <CardDescription>策略与基准从历史高点的回撤幅度。</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-[320px] w-full" role="status" aria-label="正在加载图表…" />}>
            <DrawdownChart result={result} />
          </Suspense>
        </CardContent>
      </Card>

      <Card aria-labelledby="trades-heading">
        <CardHeader className="border-b">
          <Badge variant="outline" className="mb-2 w-fit">TRADE DETAIL</Badge>
          <CardTitle id="trades-heading">交易明细</CardTitle>
        </CardHeader>
        <CardContent><TradesTable trades={result.trades} /></CardContent>
      </Card>
    </section>
  )
}
