import { useEffect, useRef, useState } from 'react'
import { ApiError, comparePortfolios } from '../api'
import type { PortfolioComparisonInput, PortfolioComparisonResponse } from '../types'
import { PortfolioComparisonForm } from './PortfolioComparisonForm'
import { PortfolioComparisonResults } from './PortfolioComparisonResults'

type ComparisonState = 'idle' | 'running' | 'success' | 'error'

export function portfolioComparisonErrorMessage(caught: unknown): string {
  if (caught instanceof ApiError) return caught.message
  return '网络连接失败，请检查服务后重试。'
}

export function PortfolioComparisonWorkspace() {
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
      setError(portfolioComparisonErrorMessage(caught))
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
        setError(portfolioComparisonErrorMessage(caught))
        setState('error')
      })
      .finally(() => {
        if (activeRequest.current === controller) activeRequest.current = null
      })
  }

  return (
    <section className="portfolio-workspace" aria-label="持仓对比工作区">
      <aside className="configuration-panel portfolio-configuration">
        <PortfolioComparisonForm onCompare={compare} disabled={state === 'running'} />
        {error && <p className="form-error comparison-api-error" role="alert">{error}</p>}
      </aside>

      {result && state !== 'running' ? <PortfolioComparisonResults result={result} /> : (
        <section className="results-placeholder portfolio-placeholder" aria-live="polite">
          <p className="eyebrow">COMPARISON</p>
          <h2>{state === 'running' ? '正在计算' : '等待持仓'}</h2>
          <p>{state === 'running' ? '正在对齐行情并计算两组持仓…' : '设置两组持仓并开始对比，即可查看同一起点的历史走势。'}</p>
          <div className="placeholder-grid" aria-hidden="true"><span /><span /><span /></div>
        </section>
      )}
    </section>
  )
}
