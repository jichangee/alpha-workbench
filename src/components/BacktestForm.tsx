import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Database, LoaderCircle, Play, RefreshCw, Settings2 } from 'lucide-react'
import { ApiError, previewMarketData, runBacktestForDataset } from '../api'
import type { BacktestResponse, FormState, RunState, StrategyDefinition } from '../types'
import { Alert, AlertDescription } from './ui/alert'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { Separator } from './ui/separator'
import { DatePicker } from './DatePicker'
import { PositionModeControls } from './PositionModeControls'
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
    end: localDate(now),
    file: null,
    positionMode: 'cash',
    alternateSymbol: '',
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
  if (form.positionMode === 'rotate') {
    if (!form.alternateSymbol.trim()) return '请输入替代股票代码。'
    if (form.symbol.trim() && form.alternateSymbol.trim().toUpperCase() === form.symbol.trim().toUpperCase()) {
      return '替代股票不能与主股票相同。'
    }
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
  const rotation = [form.positionMode, form.alternateSymbol.trim().toUpperCase()]
  if (form.source === 'csv') {
    const file = form.file
    return ['csv', form.symbol.trim(), file?.name ?? '', file?.size ?? '', file?.lastModified ?? '', ...rotation].join('|')
  }
  return ['yahoo', form.symbol.trim().toUpperCase(), form.start, form.end, ...rotation].join('|')
}

function backtestSignature(form: FormState): string {
  const sortedParams = Object.entries(form.params).sort(([left], [right]) => left.localeCompare(right))
  return JSON.stringify([form.strategyKey, sortedParams, form.initialCash, form.commission, form.slippageBps, form.positionMode])
}

function errorMessage(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : '网络连接失败，请检查服务后重试。'
}

export function BacktestForm({ strategies, onRun, onStateChange }: BacktestFormProps) {
  const [form, setForm] = useState(() => initialForm(strategies))
  const [error, setError] = useState<string>()
  const [datasetId, setDatasetId] = useState<string>()
  const [alternateDatasetId, setAlternateDatasetId] = useState<string>()
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
  const datasetReady = Boolean(
    datasetId
    && loadedFingerprint === currentMarketFingerprint
    && (form.positionMode === 'cash' || alternateDatasetId),
  )

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
      setAlternateDatasetId(undefined)
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

      const pending = form.positionMode === 'rotate'
        ? runBacktestForDataset(form, datasetId, alternateDatasetId, controller.signal)
        : runBacktestForDataset(form, datasetId, controller.signal)
      pending
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
  }, [alternateDatasetId, currentBacktestSignature, currentMarketFingerprint, datasetId, datasetReady, form, onRun, onStateChange, strategy])

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
      let submittedAlternateDatasetId: string | undefined
      if (submittedForm.positionMode === 'rotate') {
        const alternatePreview = await previewMarketData({
          ...submittedForm,
          source: 'yahoo',
          symbol: submittedForm.alternateSymbol,
          start: preview.start,
          end: preview.end,
          file: null,
        }, controller.signal)
        submittedAlternateDatasetId = alternatePreview.datasetId
      }
      const result = submittedForm.positionMode === 'rotate'
        ? await runBacktestForDataset(
          submittedForm,
          preview.datasetId,
          submittedAlternateDatasetId,
          controller.signal,
        )
        : await runBacktestForDataset(submittedForm, preview.datasetId, controller.signal)
      if (!controller.signal.aborted) {
        lastRequestedSignature.current = submittedBacktestSignature
        setDatasetId(preview.datasetId)
        setAlternateDatasetId(submittedAlternateDatasetId)
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
    <form className="space-y-6 p-5 md:p-6" onSubmit={submit} noValidate>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-primary">
          <Settings2 className="size-4" aria-hidden="true" />
          <p className="text-xs font-semibold tracking-[0.16em]">BACKTEST CONFIG</p>
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">回测参数</h2>
        <p className="text-sm leading-6 text-muted-foreground">配置一次可复现的历史模拟。</p>
      </div>

      <Separator />

      <fieldset className="space-y-4">
        <legend className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <Database className="size-4 text-primary" aria-hidden="true" />
          行情数据
        </legend>
        <div className="grid gap-2">
          <Label htmlFor="market-source">数据来源</Label>
          <Select
            value={form.source}
            onValueChange={(source: FormState['source']) => {
              setForm((current) => ({ ...current, source, file: null }))
              setError(undefined)
            }}
          >
            <SelectTrigger id="market-source" aria-label="数据来源" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yahoo">Yahoo Finance 自动下载</SelectItem>
              <SelectItem value="csv">本地 CSV 文件</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {form.source === 'yahoo' ? (
          <div className="grid gap-4 md:grid-cols-3" key="yahoo-fields">
            <div className="grid gap-2">
              <Label htmlFor="symbol">股票代码</Label>
              <Input id="symbol" aria-label="股票代码" value={form.symbol} onChange={(event) => setForm((current) => ({ ...current, symbol: event.target.value }))} placeholder="例如 SPY" />
              <p className="text-xs leading-5 text-muted-foreground">支持美股和 ETF，例如 AAPL、SPY。</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="start-date">开始日期</Label>
              <DatePicker
                id="start-date"
                aria-label="开始日期"
                value={form.start}
                max={form.end || undefined}
                onChange={(start) => setForm((current) => ({ ...current, start }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="end-date">结束日期</Label>
              <DatePicker
                id="end-date"
                aria-label="结束日期"
                value={form.end}
                min={form.start || undefined}
                max={localDate(new Date())}
                onChange={(end) => setForm((current) => ({ ...current, end }))}
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2" key="csv-fields">
            <div className="grid gap-2">
              <Label htmlFor="csv-file">CSV 文件</Label>
              <Input id="csv-file" aria-label="CSV 文件" type="file" accept=".csv,text/csv" onChange={(event) => setForm((current) => ({ ...current, file: event.target.files?.[0] ?? null }))} />
              <p className="text-xs leading-5 text-muted-foreground">需要包含 Date、Open、High、Low、Close 列。</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="optional-symbol">标的代码（可选）</Label>
              <Input id="optional-symbol" aria-label="标的代码（可选）" value={form.symbol} onChange={(event) => setForm((current) => ({ ...current, symbol: event.target.value }))} placeholder="留空时使用文件名" />
            </div>
          </div>
        )}
      </fieldset>

      <Separator />

      <fieldset className="space-y-4">
        <legend className="mb-4 text-sm font-semibold">策略</legend>
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

      <Separator />

      <fieldset className="space-y-4">
        <legend className="mb-4 text-sm font-semibold">交易假设</legend>
        <PositionModeControls
          mode={form.positionMode}
          alternateSymbol={form.alternateSymbol}
          onModeChange={(positionMode) => {
            setForm((current) => ({ ...current, positionMode }))
            setError(undefined)
          }}
          onAlternateSymbolChange={(alternateSymbol) => {
            setForm((current) => ({ ...current, alternateSymbol }))
            setError(undefined)
          }}
        />
        <div className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="initial-cash">初始资金（美元）</Label>
            <Input id="initial-cash" className="font-mono" aria-label="初始资金（美元）" type="number" min="1" step="1000" value={form.initialCash} onChange={(event) => updateNumber('initialCash', event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="commission">单笔佣金（美元）</Label>
            <Input id="commission" className="font-mono" aria-label="单笔佣金（美元）" type="number" min="0" step="0.01" value={form.commission} onChange={(event) => updateNumber('commission', event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="slippage">滑点（基点）</Label>
            <Input id="slippage" className="font-mono" aria-label="滑点（基点）" type="number" min="0" max="9999" step="1" value={form.slippageBps} onChange={(event) => updateNumber('slippageBps', event.target.value)} />
          </div>
        </div>
      </fieldset>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!datasetReady ? (
        <Button className="w-full sm:w-auto" type="submit" disabled={runningMode !== null || strategies.length === 0}>
          {runningMode === 'loading' ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : (
            <Play aria-hidden="true" />
          )}
          {runningMode === 'loading'
            ? form.positionMode === 'rotate' ? '正在装载两只股票…' : '正在装载行情…'
            : form.positionMode === 'rotate' ? '加载两只股票并开始回测' : '加载行情并开始回测'}
        </Button>
      ) : (
        <Alert aria-live="polite" className="border-primary/30 bg-primary/5">
          <RefreshCw className={runningMode === 'automatic' ? 'animate-spin text-primary' : 'text-primary'} aria-hidden="true" />
          <AlertDescription>
            {runningMode === 'automatic' ? '正在自动回测…' : '参数调整后自动回测'}
          </AlertDescription>
        </Alert>
      )}
    </form>
  )
}
