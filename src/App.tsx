'use client'

import { useEffect, useState } from 'react'
import { Activity, BarChart3, BriefcaseBusiness, FlaskConical } from 'lucide-react'
import { fetchStrategies } from './api'
import { BacktestForm } from './components/BacktestForm'
import { PortfolioComparisonWorkspace } from './components/PortfolioComparisonWorkspace'
import { ResultsDashboard } from './components/ResultsDashboard'
import { Alert, AlertDescription } from './components/ui/alert'
import { Badge } from './components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card'
import { Skeleton } from './components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs'
import type { BacktestResponse, RunState, StrategyDefinition } from './types'

type WorkspaceMode = 'backtest' | 'portfolio'

export default function App() {
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceMode>('backtest')
  const [strategies, setStrategies] = useState<StrategyDefinition[]>([])
  const [catalogError, setCatalogError] = useState<string>()
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [runState, setRunState] = useState<RunState>('idle')
  const [result, setResult] = useState<BacktestResponse>()

  useEffect(() => {
    const controller = new AbortController()
    fetchStrategies(controller.signal)
      .then(setStrategies)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setCatalogError(error instanceof Error ? error.message : '无法加载策略目录。')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingCatalog(false)
      })
    return () => controller.abort()
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/70 bg-card/40" role="banner">
        <div className="mx-auto flex max-w-[1680px] flex-col gap-5 px-4 py-6 md:px-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-primary/40 text-primary">
                <FlaskConical aria-hidden="true" data-icon="inline-start" />
                ALPHA LAB
              </Badge>
              <Badge variant="secondary">
                <Activity aria-hidden="true" data-icon="inline-start" />
                本地运行
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium text-primary">美股量化研究台</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">
                {activeWorkspace === 'backtest' ? '策略回测' : '持仓对比'}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {activeWorkspace === 'backtest'
                  ? '用历史日线验证信号、交易成本与换仓假设。'
                  : '在同一历史区间比较资产配置与再平衡策略。'}
              </p>
            </div>
          </div>
          <Alert className="max-w-xl border-border/80 bg-background/60">
            <AlertDescription>
              结果仅供教育与研究，不构成投资建议；历史表现不代表未来收益。
            </AlertDescription>
          </Alert>
        </div>
      </header>

      <main className="mx-auto max-w-[1680px] px-4 py-5 md:px-6 md:py-7">
        <Tabs
          value={activeWorkspace}
          onValueChange={(value) => setActiveWorkspace(value as WorkspaceMode)}
        >
          <TabsList className="mb-6 h-auto w-full max-w-xl grid-cols-2" aria-label="分析模式">
            <TabsTrigger value="backtest" aria-label="策略回测" className="gap-2 py-2.5">
              <BarChart3 aria-hidden="true" />
              策略回测
            </TabsTrigger>
            <TabsTrigger value="portfolio" aria-label="持仓对比" className="gap-2 py-2.5">
              <BriefcaseBusiness aria-hidden="true" />
              持仓对比
            </TabsTrigger>
          </TabsList>

          <TabsContent value="backtest">
            <section
              className="grid items-start gap-6 xl:grid-cols-[minmax(390px,510px)_minmax(0,1fr)]"
              aria-label="回测配置工作区"
            >
              <Card className="overflow-hidden">
                {loadingCatalog && (
                  <CardContent className="space-y-4 p-6" role="status">
                    <Skeleton className="h-7 w-36" />
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                  </CardContent>
                )}
                {catalogError && (
                  <CardContent className="p-6">
                    <Alert variant="destructive">
                      <AlertDescription>无法加载策略目录：{catalogError}</AlertDescription>
                    </Alert>
                  </CardContent>
                )}
                {!loadingCatalog && !catalogError && (
                  <BacktestForm
                    strategies={strategies}
                    onRun={setResult}
                    onStateChange={setRunState}
                  />
                )}
              </Card>

              {result ? <ResultsDashboard result={result} /> : (
                <Card className="min-h-[420px]" aria-live="polite">
                  <CardHeader className="my-auto">
                    <Badge variant="outline" className="mb-4 w-fit">RESULTS</Badge>
                    <CardTitle className="text-3xl">准备就绪</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="max-w-md leading-7 text-muted-foreground">
                      {runState === 'running'
                        ? '正在加载行情并执行回测…'
                        : runState === 'success'
                          ? '回测已完成，绩效结果将在下一步展示。'
                          : '设置行情、策略与交易成本后，即可运行回测。'}
                    </p>
                    <div className="mt-10 grid grid-cols-3 items-end gap-3" aria-hidden="true">
                      <Skeleton className="h-16" />
                      <Skeleton className="h-28" />
                      <Skeleton className="h-20" />
                    </div>
                  </CardContent>
                </Card>
              )}
            </section>
          </TabsContent>

          <TabsContent value="portfolio">
            <PortfolioComparisonWorkspace />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
