import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, previewMarketData, runBacktestForDataset } from '../api'
import type { BacktestResponse, FormState, RunState, StrategyDefinition } from '../types'
import { StrategyControls } from './StrategyControls'

interface BacktestFormProps {
  strategies: readonly StrategyDefinition[]
  onRun: (result: BacktestResponse) => void
  onStateChange?: (state: RunState) => void
}

type RunningMode = 'loading' | 'automatic' | null

function localDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function initialForm(strategies: readonly StrategyDefinition[]): FormState {
  const now = new Date()
  const lastCompleteYear = now.getFullYear() - 1
  const firstCompleteYear = lastCompleteYear - 4
  const strategy = strategies[0]
  return {
    source: 'yahoo',
    symbol: 'SPY',
    start: localDate(new Date(firstCompleteYear, 0, 1)),
    end: localDate(new Date(lastCompleteYear, 11, 31)),
    file: null,
    strategyKey: strategy?.key ?? '',
    params: Object.fromEntries(strategy?.parameters.map((parameter) => [parameter.key, parameter.default]) ?? []),
    initialCash: 100000,
    commission: 0,
    slippageBps: 5,
  }
}

function relationshipIsValid(expression: string, params: Record<string, number>): boolean {
  const match = expression.match(/^([\w]+)\s*(<=|>=|<|>)\s*([\w]+)$/)
  if (!match) return true
  const [, leftKey, operator, rightKey] = match
  const left = params[leftKey]
  const right = params[rightKey]
  if (!Number.isFinite(left) || !Number.isFinite(right)) return true
  switch (operator) {
    case '<': return left < right
    case '<=': return left <= right
    case '>': return left > right
    case '>=': return left >= right
    default: return true
  }
}

function validateForm(form: FormState, strategy: StrategyDefinition | undefined): string | undefined {
  if (!strategy) return '请选择策略。'
  if (form.source === 'yahoo') {
    if (!form.symbol.trim()) return '请输入股票代码。'
    if (!form.start || !form.end) return '请输入开始和结束日期。'
    if (form.start > form.end) return '结束日期不能早于开始日期。'
  } else if (!form.file) {
    return '请上传 CSV 文件。'
  }

  for (const parameter of strategy.parameters) {
    const value = form.params[parameter.key]
    if (!Number.isFinite(value) || value < parameter.minimum || value > parameter.maximum) {
      return `${parameter.name}必须在 ${parameter.minimum} 到 ${parameter.maximum} 之间。`
    }
    if (parameter.type === 'integer' && !Number.isInteger(value)) return `${parameter.name}必须为整数。`
  }
  for (const rule of strategy.validationRules) {
    if (!relationshipIsValid(rule.expression, form.params)) return rule.message
  }
  if (!Number.isFinite(form.initialCash) || form.initialCash <= 0) return '初始资金必须为正数。'
  if (!Number.isFinite(form.commission) || form.commission < 0) return '佣金不能小于 0。'
  if (!Number.isFinite(form.slippageBps) || form.slippageBps < 0 || form.slippageBps >= 10000) {
    return '滑点基点必须在 0 到 10000 之间。'
  }
}

function marketFingerprint(form: FormState): string {
  if (form.source === 'csv') {
    const file = form.file
    return ['csv', form.symbol.trim(), file?.name ?? '', file?.size ?? '', file?.lastModified ?? ''].join('|')
  }
  return ['yahoo', form.symbol.trim().toUpperCase(), form.start, form.end].join('|')
}

function backtestSignature(form: FormState): string {
  const sortedParams = Object.entries(form.params).sort(([left], [right]) => left.localeCompare(right))
  return JSON.stringify([form.strategyKey, sortedParams, form.initialCash, form.commission, form.slippageBps])
}

function errorMessage(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : '网络连接失败，请检查服务后重试。'
}

export function BacktestForm({ strategies, onRun, onStateChange }: BacktestFormProps) {
  const [form, setForm] = useState(() => initialForm(strategies))
  const [error, setError] = useState<string>()
  const [datasetId, setDatasetId] = useState<string>()
  const [loadedFingerprint, setLoadedFingerprint] = useState<string>()
  const [runningMode, setRunningMode] = useState<RunningMode>(null)
  const activeRequest = useRef<AbortController | null>(null)
  const activeMarketFingerprint = useRef<string | undefined>(undefined)
  const lastRequestedSignature = useRef('')
  const strategy = useMemo(
    () => strategies.find((candidate) => candidate.key === form.strategyKey),
    [form.strategyKey, strategies],
  )
  const currentMarketFingerprint = useMemo(() => marketFingerprint(form), [form])
  const currentBacktestSignature = useMemo(() => backtestSignature(form), [form])
  const datasetReady = Boolean(datasetId && loadedFingerprint === currentMarketFingerprint)

  useEffect(() => () => activeRequest.current?.abort(), [])

  useEffect(() => {
    if (activeRequest.current && activeMarketFingerprint.current !== currentMarketFingerprint) {
      activeRequest.current.abort()
      activeRequest.current = null
      activeMarketFingerprint.current = undefined
      setRunningMode(null)
    }
    if (datasetId && loadedFingerprint !== currentMarketFingerprint) {
      lastRequestedSignature.current = ''
      setDatasetId(undefined)
      setLoadedFingerprint(undefined)
    }
  }, [currentMarketFingerprint, datasetId, loadedFingerprint])

  useEffect(() => {
    if (!datasetReady || !datasetId || currentBacktestSignature === lastRequestedSignature.current) return

    const validationError = validateForm(form, strategy)
    if (validationError) {
      setError(validationError)
      onStateChange?.('error')
      return
    }

    let controller: AbortController | undefined
    const timer = window.setTimeout(() => {
      activeRequest.current?.abort()
      controller = new AbortController()
      activeRequest.current = controller
      activeMarketFingerprint.current = currentMarketFingerprint
      lastRequestedSignature.current = currentBacktestSignature
      setError(undefined)
      setRunningMode('automatic')
      onStateChange?.('running')

      runBacktestForDataset(form, datasetId, controller.signal)
        .then((result) => {
          if (!controller?.signal.aborted) {
            onRun(result)
            onStateChange?.('success')
          }
        })
        .catch((caught: unknown) => {
          if (!controller?.signal.aborted) {
            setError(errorMessage(caught))
            onStateChange?.('error')
          }
        })
        .finally(() => {
          if (activeRequest.current === controller) {
            activeRequest.current = null
            activeMarketFingerprint.current = undefined
            setRunningMode(null)
          }
        })
    }, 400)

    return () => {
      window.clearTimeout(timer)
      controller?.abort()
    }
  }, [currentBacktestSignature, currentMarketFingerprint, datasetId, datasetReady, form, onRun, onStateChange, strategy])

  const updateNumber = (field: 'initialCash' | 'commission' | 'slippageBps', value: string) => {
    setForm((current) => ({ ...current, [field]: Number(value) }))
  }

  const selectStrategy = (strategyKey: string) => {
    const nextStrategy = strategies.find((candidate) => candidate.key === strategyKey)
    setForm((current) => ({
      ...current,
      strategyKey,
      params: Object.fromEntries(nextStrategy?.parameters.map((parameter) => [parameter.key, parameter.default]) ?? []),
    }))
    setError(undefined)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validationError = validateForm(form, strategy)
    if (validationError) {
      setError(validationError)
      onStateChange?.('error')
      return
    }

    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    activeMarketFingerprint.current = currentMarketFingerprint
    const submittedForm = form
    const submittedMarketFingerprint = currentMarketFingerprint
    const submittedBacktestSignature = currentBacktestSignature
    setError(undefined)
    setRunningMode('loading')
    onStateChange?.('running')

    try {
      const preview = await previewMarketData(submittedForm, controller.signal)
      const result = await runBacktestForDataset(submittedForm, preview.datasetId, controller.signal)
      if (!controller.signal.aborted) {
        lastRequestedSignature.current = submittedBacktestSignature
        setDatasetId(preview.datasetId)
        setLoadedFingerprint(submittedMarketFingerprint)
        onRun(result)
        onStateChange?.('success')
      }
    } catch (caught) {
      if (!controller.signal.aborted) {
        setError(errorMessage(caught))
        onStateChange?.('error')
      }
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null
        activeMarketFingerprint.current = undefined
        setRunningMode(null)
      }
    }
  }

  return (
    <form className="backtest-form" onSubmit={submit} noValidate>
      <div className="form-heading">
        <p className="eyebrow">配置一次可复现的模拟</p>
        <h2>回测参数</h2>
      </div>

      <fieldset>
        <legend>行情数据</legend>
        <label>
          数据来源
          <select
            aria-label="数据来源"
            value={form.source}
            onChange={(event) => {
              setForm((current) => ({ ...current, source: event.target.value as FormState['source'], file: null }))
              setError(undefined)
            }}
          >
            <option value="yahoo">Yahoo Finance 自动下载</option>
            <option value="csv">本地 CSV 文件</option>
          </select>
        </label>
        {form.source === 'yahoo' ? (
          <div className="field-grid" key="yahoo-fields">
            <label>
              股票代码
              <input aria-label="股票代码" value={form.symbol} onChange={(event) => setForm((current) => ({ ...current, symbol: event.target.value }))} placeholder="例如 SPY" />
              <small>支持美股和 ETF 代码，例如 AAPL、SPY。</small>
            </label>
            <label>
              开始日期
              <input aria-label="开始日期" type="date" value={form.start} max={form.end || undefined} onChange={(event) => setForm((current) => ({ ...current, start: event.target.value }))} />
            </label>
            <label>
              结束日期
              <input aria-label="结束日期" type="date" value={form.end} min={form.start || undefined} max={localDate(new Date())} onChange={(event) => setForm((current) => ({ ...current, end: event.target.value }))} />
            </label>
          </div>
        ) : (
          <div className="field-grid" key="csv-fields">
            <label>
              CSV 文件
              <input aria-label="CSV 文件" type="file" accept=".csv,text/csv" onChange={(event) => setForm((current) => ({ ...current, file: event.target.files?.[0] ?? null }))} />
              <small>需要包含 Date、Open、High、Low、Close 列。</small>
            </label>
            <label>
              标的代码（可选）
              <input aria-label="标的代码（可选）" value={form.symbol} onChange={(event) => setForm((current) => ({ ...current, symbol: event.target.value }))} placeholder="留空时使用文件名" />
            </label>
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend>策略</legend>
        <StrategyControls
          strategies={strategies}
          strategyKey={form.strategyKey}
          params={form.params}
          onStrategyChange={selectStrategy}
          onParamsChange={(params) => {
            setForm((current) => ({ ...current, params }))
            setError(undefined)
          }}
        />
      </fieldset>

      <fieldset>
        <legend>交易假设</legend>
        <div className="field-grid">
          <label>
            初始资金（美元）
            <input aria-label="初始资金（美元）" type="number" min="1" step="1000" value={form.initialCash} onChange={(event) => updateNumber('initialCash', event.target.value)} />
          </label>
          <label>
            单笔佣金（美元）
            <input aria-label="单笔佣金（美元）" type="number" min="0" step="0.01" value={form.commission} onChange={(event) => updateNumber('commission', event.target.value)} />
          </label>
          <label>
            滑点（基点）
            <input aria-label="滑点（基点）" type="number" min="0" max="9999" step="1" value={form.slippageBps} onChange={(event) => updateNumber('slippageBps', event.target.value)} />
          </label>
        </div>
      </fieldset>

      {error && <p className="form-error" role="alert">{error}</p>}
      {!datasetReady ? (
        <button className="run-button" type="submit" disabled={runningMode !== null || strategies.length === 0}>
          {runningMode === 'loading' ? '正在装载行情…' : '加载行情并开始回测'}
        </button>
      ) : (
        <p className={`auto-run-status${runningMode === 'automatic' ? ' is-running' : ''}`} aria-live="polite">
          <span aria-hidden="true" />
          {runningMode === 'automatic' ? '正在自动回测…' : '参数调整后自动回测'}
        </p>
      )}
    </form>
  )
}
