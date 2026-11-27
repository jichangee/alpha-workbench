import { useEffect, useRef, useState } from 'react'
import { ApiError, comparePortfolios } from '../api'
import { useI18n, type Locale } from '../i18n'
import type { PortfolioComparisonInput, PortfolioComparisonResponse } from '../types'
import { Alert, AlertDescription } from './ui/alert'
import { Badge } from './ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Skeleton } from './ui/skeleton'
import { PortfolioComparisonForm } from './PortfolioComparisonForm'
import { PortfolioComparisonResults } from './PortfolioComparisonResults'

type ComparisonState = 'idle' | 'running' | 'success' | 'error'

export function portfolioComparisonErrorMessage(caught: unknown, locale: Locale = 'zh'): string {
  if (caught instanceof ApiError) return caught.message
  return locale === 'en' ? 'Network request failed. Please check the service and retry.' : '网络连接失败，请检查服务后重试。'
}

export function PortfolioComparisonWorkspace() {
  const { locale } = useI18n()
  const isEn = locale === 'en'
  const [state, setState] = useState<ComparisonState>('idle')
  const [result, setResult] = useState<PortfolioComparisonResponse>()
  const [error, setError] = useState<string>()
  const activeRequest = useRef<AbortController | null>(null)

  useEffect(() => () => activeRequest.current?.abort(), [])

  const compare = (input: PortfolioComparisonInput) => {
    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    setState('running')
    setError(undefined)

    let pending: Promise<PortfolioComparisonResponse>
    try {
      pending = comparePortfolios(input, controller.signal)
    } catch (caught: unknown) {
      setError(portfolioComparisonErrorMessage(caught, locale))
      setState('error')
      activeRequest.current = null
      return
    }

    pending
      .then((nextResult) => {
        if (controller.signal.aborted || activeRequest.current !== controller) return
        setResult(nextResult)
        setState('success')
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted || activeRequest.current !== controller) return
        setError(portfolioComparisonErrorMessage(caught, locale))
        setState('error')
      })
      .finally(() => {
        if (activeRequest.current === controller) activeRequest.current = null
      })
  }

  return (
    <section className="grid items-start gap-6 xl:grid-cols-[minmax(520px,610px)_minmax(0,1fr)]" aria-label={isEn ? 'Portfolio comparison workspace' : '持仓对比工作区'}>
      <Card className="min-w-0">
        <PortfolioComparisonForm onCompare={compare} running={state === 'running'} />
        {error && (
          <CardContent>
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </CardContent>
        )}
      </Card>

      {result && state !== 'running' ? <PortfolioComparisonResults result={result} /> : (
        <Card className="min-h-[420px]" aria-live="polite">
          <CardHeader className="my-auto">
            <Badge variant="outline" className="mb-4 w-fit">COMPARISON</Badge>
            <CardTitle className="text-3xl">
              <h2>
                {state === 'running'
                  ? (isEn ? 'Calculating' : '正在计算')
                  : (isEn ? 'Awaiting Portfolios' : '等待持仓')}
              </h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="max-w-md leading-7 text-muted-foreground">
              {state === 'running'
                ? (isEn ? 'Aligning market data and calculating portfolio curves…' : '正在对齐行情并计算两组持仓…')
                : (isEn ? 'Configure portfolios and run comparison to view normalized equity curves.' : '设置两组持仓并开始对比，即可查看同一起点的历史走势。')}
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
  )
}
