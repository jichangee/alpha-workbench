import { useEffect, useState } from 'react'
import { fetchStrategies } from './api'
import { BacktestForm } from './components/BacktestForm'
import { PortfolioComparisonWorkspace } from './components/PortfolioComparisonWorkspace'
import { ResultsDashboard } from './components/ResultsDashboard'
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
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="product-mark">ALPHA LAB / US EQUITIES</p>
          <h1>{activeWorkspace === 'backtest' ? '美股策略回测' : '美股持仓对比'}</h1>
          <p>{activeWorkspace === 'backtest' ? '用历史日线检验交易假设' : '在同一历史区间比较两组持仓'}；结果仅供教育与研究，不构成投资建议。</p>
        </div>
        <span className="market-badge">{activeWorkspace === 'backtest' ? '日线 · 做多 · 支持双标的换仓' : '复权日线 · 首日配置 · 不再平衡'}</span>
      </header>

      <nav className="workspace-tabs" role="tablist" aria-label="分析模式">
        <button type="button" role="tab" aria-label="策略回测" aria-selected={activeWorkspace === 'backtest'} onClick={() => setActiveWorkspace('backtest')}>
          <span>策略回测</span>
          <small>交易信号与换仓模拟</small>
        </button>
        <button type="button" role="tab" aria-label="持仓对比" aria-selected={activeWorkspace === 'portfolio'} onClick={() => setActiveWorkspace('portfolio')}>
          <span>持仓对比</span>
          <small>两组组合历史走势</small>
        </button>
      </nav>

      {activeWorkspace === 'backtest' ? (
        <section className="workspace" aria-label="回测配置工作区">
          <aside className="configuration-panel">
            {loadingCatalog && <p className="status-message" role="status">正在加载策略目录…</p>}
            {catalogError && <p className="form-error" role="alert">无法加载策略目录：{catalogError}</p>}
            {!loadingCatalog && !catalogError && (
              <BacktestForm
                strategies={strategies}
                onRun={setResult}
                onStateChange={setRunState}
              />
            )}
          </aside>
          {result ? <ResultsDashboard result={result} /> : <section className="results-placeholder" aria-live="polite">
            <p className="eyebrow">RESULTS</p>
            <h2>准备就绪</h2>
            <p>
              {runState === 'running' ? '正在加载行情并执行回测…' : runState === 'success' ? '回测已完成，绩效结果将在下一步展示。' : '设置行情、策略与交易成本后，即可运行回测。'}
            </p>
            <div className="placeholder-grid" aria-hidden="true">
              <span /><span /><span />
            </div>
          </section>}
        </section>
      ) : <PortfolioComparisonWorkspace />}
    </main>
  )
}
