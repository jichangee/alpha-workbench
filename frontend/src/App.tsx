import { useEffect, useState } from 'react'
import { fetchStrategies } from './api'
import { BacktestForm } from './components/BacktestForm'
import type { RunState, StrategyDefinition } from './types'

export default function App() {
  const [strategies, setStrategies] = useState<StrategyDefinition[]>([])
  const [catalogError, setCatalogError] = useState<string>()
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [runState, setRunState] = useState<RunState>('idle')

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
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="product-mark">ALPHA LAB / US EQUITIES</p>
          <h1>美股策略回测</h1>
          <p>用历史日线检验交易假设；结果仅供教育与研究，不构成投资建议。</p>
        </div>
        <span className="market-badge">日线 · 做多 · 单标的</span>
      </header>

      <section className="workspace" aria-label="回测配置工作区">
        <aside className="configuration-panel">
          {loadingCatalog && <p className="status-message" role="status">正在加载策略目录…</p>}
          {catalogError && <p className="form-error" role="alert">无法加载策略目录：{catalogError}</p>}
          {!loadingCatalog && !catalogError && (
            <BacktestForm
              strategies={strategies}
              onRun={() => undefined}
              onStateChange={setRunState}
            />
          )}
        </aside>
        <section className="results-placeholder" aria-live="polite">
          <p className="eyebrow">RESULTS</p>
          <h2>准备就绪</h2>
          <p>
            {runState === 'running' ? '正在加载行情并执行回测…' : runState === 'success' ? '回测已完成，绩效结果将在下一步展示。' : '设置行情、策略与交易成本后，即可运行回测。'}
          </p>
          <div className="placeholder-grid" aria-hidden="true">
            <span /><span /><span />
          </div>
        </section>
      </section>
    </main>
  )
}
