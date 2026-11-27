import { type FormEvent, useRef, useState } from 'react'
import { LoaderCircle, Plus, Scale, Trash2 } from 'lucide-react'
import { useI18n, type Locale } from '../i18n'
import type {
  PortfolioComparisonInput,
  PortfolioDefinitionInput,
  RebalanceFrequency,
} from '../types'
import { cn } from '../lib/utils'
import { Alert, AlertDescription } from './ui/alert'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Separator } from './ui/separator'
import { DatePicker } from './DatePicker'

interface PortfolioComparisonFormProps {
  onCompare: (input: PortfolioComparisonInput) => void
  running: boolean
}

interface PositionDraft {
  id: number
  symbol: string
  weight: string
}

interface PortfolioDraft {
  id: number
  number: number
  name: string
  rebalanceFrequency: RebalanceFrequency
  rebalanceThreshold: string
  positions: PositionDraft[]
}

function localDate(value: Date): string {
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${value.getFullYear()}-${month}-${day}`
}

function initialDates(): { start: string; end: string } {
  const now = new Date()
  const lastCompleteYear = now.getFullYear() - 1
  return {
    start: localDate(new Date(lastCompleteYear - 4, 0, 1)),
    end: localDate(now),
  }
}

function initialPortfolios(): PortfolioDraft[] {
  return [
    {
      id: 1,
      number: 1,
      name: '持仓 1',
      rebalanceFrequency: 'none',
      rebalanceThreshold: '5',
      positions: [
        { id: 1, symbol: 'VOO', weight: '50' },
        { id: 2, symbol: 'QQQ', weight: '50' },
      ],
    },
    {
      id: 2,
      number: 2,
      name: '持仓 2',
      rebalanceFrequency: 'none',
      rebalanceThreshold: '5',
      positions: [{ id: 3, symbol: 'SOXX', weight: '100' }],
    },
  ]
}

function totalWeight(portfolio: PortfolioDraft): number {
  return portfolio.positions.reduce((total, position) => {
    const weight = Number(position.weight)
    return total + (Number.isFinite(weight) ? weight : 0)
  }, 0)
}

function formattedTotal(total: number): string {
  return Number.isInteger(total) ? String(total) : total.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function validate(
  start: string,
  end: string,
  portfolios: PortfolioDraft[],
  locale: Locale,
): string | undefined {
  const isEn = locale === 'en'
  if (!start || !end) return isEn ? 'Please enter start and end dates.' : '请输入开始和结束日期。'
  if (start > end) return isEn ? 'End date cannot be earlier than start date.' : '结束日期不能早于开始日期。'
  if (end > localDate(new Date())) return isEn ? 'End date cannot be in the future.' : '结束日期不能晚于今天。'

  for (const portfolio of portfolios) {
    if (!portfolio.name.trim()) return isEn ? 'Please enter a portfolio name.' : '请输入持仓名称。'
    if (portfolio.rebalanceFrequency === 'threshold') {
      const threshold = Number(portfolio.rebalanceThreshold)
      if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 100) {
        return isEn ? 'Deviation threshold must be > 0% and <= 100%.' : '偏离阈值必须大于 0% 且不超过 100%。'
      }
    }
    const symbols = portfolio.positions.map((position) => position.symbol.trim().toUpperCase())
    if (symbols.some((symbol) => !symbol)) return isEn ? 'Please enter a ticker symbol.' : '请输入股票代码。'
    if (new Set(symbols).size !== symbols.length) return isEn ? 'Duplicate symbols are not allowed in the same portfolio.' : '同一持仓不能重复添加股票。'
    if (portfolio.positions.some((position) => {
      const weight = Number(position.weight)
      return !Number.isFinite(weight) || weight <= 0
    })) return isEn ? 'Each weight must be greater than 0.' : '每只股票的权重必须大于 0。'
    if (Math.abs(totalWeight(portfolio) - 100) > 0.0001) {
      return isEn ? 'Portfolio weights must sum to 100%.' : '每组持仓权重合计必须为 100%。'
    }
  }
}

export function PortfolioComparisonForm({ onCompare, running }: PortfolioComparisonFormProps) {
  const { locale } = useI18n()
  const isEn = locale === 'en'
  const [{ start: initialStart, end: initialEnd }] = useState(initialDates)
  const [start, setStart] = useState(initialStart)
  const [end, setEnd] = useState(initialEnd)
  const [portfolios, setPortfolios] = useState<PortfolioDraft[]>(initialPortfolios)
  const [error, setError] = useState<string>()
  const nextPositionId = useRef(4)
  const nextPortfolioId = useRef(3)
  const nextPortfolioNumber = useRef(3)

  const updatePortfolio = (portfolioId: number, update: (portfolio: PortfolioDraft) => PortfolioDraft) => {
    setPortfolios((current) => current.map((portfolio) => (
      portfolio.id === portfolioId ? update(portfolio) : portfolio
    )))
    setError(undefined)
  }

  const updatePosition = (
    portfolioId: number,
    positionId: number,
    field: 'symbol' | 'weight',
    value: string,
  ) => updatePortfolio(portfolioId, (portfolio) => ({
    ...portfolio,
    positions: portfolio.positions.map((position) => (
      position.id === positionId ? { ...position, [field]: value } : position
    )),
  }))

  const addPosition = (portfolioId: number) => updatePortfolio(portfolioId, (portfolio) => ({
    ...portfolio,
    positions: portfolio.positions.length >= 8 ? portfolio.positions : [
      ...portfolio.positions,
      { id: nextPositionId.current++, symbol: '', weight: '0' },
    ],
  }))

  const removePosition = (portfolioId: number, positionId: number) => updatePortfolio(
    portfolioId,
    (portfolio) => ({
      ...portfolio,
      positions: portfolio.positions.length === 1
        ? portfolio.positions
        : portfolio.positions.filter((position) => position.id !== positionId),
    }),
  )

  const addPortfolio = () => {
    if (portfolios.length >= 5) return
    const portfolioNumber = nextPortfolioNumber.current++
    const portfolio: PortfolioDraft = {
      id: nextPortfolioId.current++,
      number: portfolioNumber,
      name: isEn ? `Portfolio ${portfolioNumber}` : `持仓 ${portfolioNumber}`,
      rebalanceFrequency: 'none',
      rebalanceThreshold: '5',
      positions: [{
        id: nextPositionId.current++,
        symbol: '',
        weight: '100',
      }],
    }
    setPortfolios((current) => [...current, portfolio])
    setError(undefined)
  }

  const removePortfolio = (portfolioId: number) => {
    setPortfolios((current) => current.length <= 2
      ? current
      : current.filter((portfolio) => portfolio.id !== portfolioId))
    setError(undefined)
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const validationError = validate(start, end, portfolios, locale)
    if (validationError) {
      setError(validationError)
      return
    }

    const normalized = portfolios.map<PortfolioDefinitionInput>((portfolio) => ({
      name: portfolio.name.trim(),
      rebalanceFrequency: portfolio.rebalanceFrequency,
      ...(portfolio.rebalanceFrequency === 'threshold'
        ? { rebalanceThreshold: Number(portfolio.rebalanceThreshold) }
        : {}),
      positions: portfolio.positions.map((position) => ({
        symbol: position.symbol.trim().toUpperCase(),
        weight: Number(position.weight) / 100,
      })),
    }))
    onCompare({
      start,
      end,
      portfolios: normalized,
    })
  }

  return (
    <form className="space-y-6 p-5 md:p-6" onSubmit={submit} noValidate>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="outline" className="mb-3 border-primary/40 text-primary">PORTFOLIOS</Badge>
          <h2 className="text-2xl font-semibold tracking-tight">
            {isEn ? `Edit ${portfolios.length} Portfolios` : `编辑 ${portfolios.length} 组持仓`}
          </h2>
        </div>
        <p className="max-w-xs text-sm leading-6 text-muted-foreground sm:text-right">
          {isEn
            ? 'Allocated on day one with independent rebalancing schedules.'
            : '首日按权重配置，每组可独立选择再平衡周期。'}
        </p>
      </div>

      <Separator />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="comparison-start">{isEn ? 'Start Date' : '开始日期'}</Label>
          <DatePicker
            id="comparison-start"
            aria-label={isEn ? 'Comparison start date' : '对比开始日期'}
            value={start}
            max={end}
            onChange={(value) => {
              setStart(value)
              setError(undefined)
            }}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="comparison-end">{isEn ? 'End Date' : '结束日期'}</Label>
          <DatePicker
            id="comparison-end"
            aria-label={isEn ? 'Comparison end date' : '对比结束日期'}
            value={end}
            min={start}
            max={localDate(new Date())}
            onChange={(value) => {
              setEnd(value)
              setError(undefined)
            }}
          />
        </div>
      </div>

      <div className="grid gap-4">
        {portfolios.map((portfolio, portfolioIndex) => {
          const total = totalWeight(portfolio)
          const totalIsValid = Math.abs(total - 100) <= 0.0001
          const portfolioLabel = isEn ? `Portfolio ${portfolio.number}` : `持仓 ${portfolio.number}`
          return (
            <Card
              size="sm"
              className={cn(
                'border-l-2 bg-muted/10',
                portfolioIndex === 0 && 'border-l-emerald-400',
                portfolioIndex === 1 && 'border-l-orange-400',
                portfolioIndex === 2 && 'border-l-blue-400',
                portfolioIndex === 3 && 'border-l-fuchsia-400',
                portfolioIndex === 4 && 'border-l-amber-400',
              )}
              key={portfolio.id}
              aria-label={isEn ? `${portfolioLabel} editor` : `${portfolioLabel} 编辑器`}
            >
              <CardHeader className="border-b sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="grid gap-2">
                  <Label htmlFor={`portfolio-name-${portfolio.id}`}>{isEn ? 'Portfolio Name' : '持仓名称'}</Label>
                  <Input
                    id={`portfolio-name-${portfolio.id}`}
                    aria-label={isEn ? `${portfolioLabel} name` : `${portfolioLabel} 名称`}
                    className="font-semibold"
                    value={portfolio.name}
                    maxLength={40}
                    onChange={(event) => updatePortfolio(portfolio.id, (current) => ({ ...current, name: event.target.value }))}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  aria-label={isEn ? `Remove ${portfolioLabel}` : `删除${portfolioLabel}`}
                  disabled={portfolios.length <= 2}
                  onClick={() => removePortfolio(portfolio.id)}
                >
                  <Trash2 aria-hidden="true" data-icon="inline-start" />
                  {isEn ? 'Remove' : '删除此持仓'}
                </Button>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor={`rebalance-${portfolio.id}`}>{isEn ? 'Rebalancing' : '再平衡策略'}</Label>
                  <Select
                    value={portfolio.rebalanceFrequency}
                    onValueChange={(value) => updatePortfolio(portfolio.id, (current) => ({
                      ...current,
                      rebalanceFrequency: value as RebalanceFrequency,
                    }))}
                  >
                    <SelectTrigger
                      id={`rebalance-${portfolio.id}`}
                      className="w-full"
                      aria-label={isEn ? `${portfolioLabel} rebalancing` : `${portfolioLabel} 再平衡策略`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{isEn ? 'No Rebalance' : '不再平衡'}</SelectItem>
                      <SelectItem value="monthly">{isEn ? 'Monthly Rebalance' : '每月再平衡'}</SelectItem>
                      <SelectItem value="quarterly">{isEn ? 'Quarterly Rebalance' : '每季度再平衡'}</SelectItem>
                      <SelectItem value="yearly">{isEn ? 'Yearly Rebalance' : '每年再平衡'}</SelectItem>
                      <SelectItem value="threshold">{isEn ? 'Threshold Rebalance' : '偏离阈值再平衡'}</SelectItem>
                    </SelectContent>
                  </Select>
                  {portfolio.rebalanceFrequency === 'threshold' ? (
                    <div className="grid gap-2">
                      <Label htmlFor={`rebalance-threshold-${portfolio.id}`}>
                        {isEn ? 'Deviation Threshold (pp)' : '偏离阈值（百分点）'}
                      </Label>
                      <div className="relative">
                        <Input
                          id={`rebalance-threshold-${portfolio.id}`}
                          aria-label={isEn ? `${portfolioLabel} threshold` : `${portfolioLabel} 偏离阈值`}
                          className="pr-7 font-mono"
                          type="number"
                          min="0.01"
                          max="100"
                          step="0.01"
                          value={portfolio.rebalanceThreshold}
                          onChange={(event) => updatePortfolio(portfolio.id, (current) => ({ ...current, rebalanceThreshold: event.target.value }))}
                        />
                        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                      </div>
                      <p className="text-xs leading-5 text-muted-foreground">
                        {isEn
                          ? 'Rebalances at close when any weight drifts by this amount, effective next trading day.'
                          : '任一实际权重与目标权重相差达到此值时，于当日收盘后恢复目标权重，并从下一交易日起生效。'}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs leading-5 text-muted-foreground">
                      {portfolio.rebalanceFrequency === 'none'
                        ? (isEn ? 'Allocated on day one with no further rebalancing.' : '首日按目标权重配置，之后不再调整。')
                        : (isEn ? 'Rebalances at period-end close, effective next trading day.' : '周期末收盘后恢复目标权重，并从下一交易日起生效。')}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-[minmax(0,1fr)_104px_32px] gap-2 px-1 text-xs font-medium text-muted-foreground" aria-hidden="true">
                  <span>{isEn ? 'Symbol' : '股票代码'}</span><span>{isEn ? 'Weight' : '权重'}</span><span />
                </div>
                <div className="space-y-2">
                {portfolio.positions.map((position, positionIndex) => (
                  <div className="grid grid-cols-[minmax(0,1fr)_104px_32px] items-center gap-2" key={position.id}>
                    <Input
                      aria-label={isEn ? `${portfolioLabel} symbol ${positionIndex + 1}` : `${portfolioLabel} 第 ${positionIndex + 1} 只股票代码`}
                      className="font-mono uppercase"
                      value={position.symbol}
                      maxLength={15}
                      placeholder={isEn ? 'e.g. VOO' : '如 VOO'}
                      autoCapitalize="characters"
                      onChange={(event) => updatePosition(portfolio.id, position.id, 'symbol', event.target.value.toUpperCase())}
                    />
                    <div className="relative">
                      <Input
                        aria-label={isEn ? `${portfolioLabel} weight ${positionIndex + 1}` : `${portfolioLabel} 第 ${positionIndex + 1} 只股票权重`}
                        className="pr-7 text-right font-mono"
                        type="number"
                        min="0.01"
                        max="100"
                        step="0.01"
                        value={position.weight}
                        onChange={(event) => updatePosition(portfolio.id, position.id, 'weight', event.target.value)}
                      />
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      type="button"
                      aria-label={isEn ? `Remove ${portfolioLabel} position ${positionIndex + 1}` : `删除${portfolioLabel} 第 ${positionIndex + 1} 只股票`}
                      disabled={portfolio.positions.length === 1}
                      onClick={() => removePosition(portfolio.id, position.id)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                ))}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    aria-label={isEn ? `Add symbol to ${portfolioLabel}` : `为${portfolioLabel} 添加股票`}
                    disabled={portfolio.positions.length >= 8}
                    onClick={() => addPosition(portfolio.id)}
                  >
                    <Plus aria-hidden="true" data-icon="inline-start" />
                    {isEn ? 'Add Symbol' : '添加股票'}
                  </Button>
                  <Badge
                    variant={totalIsValid ? 'secondary' : 'destructive'}
                    className={cn('weight-total font-mono', !totalIsValid && 'invalid')}
                  >
                    {isEn ? `Total ${formattedTotal(total)}%` : `合计 ${formattedTotal(total)}%`}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="flex items-center justify-between gap-3 border-t pt-5">
        <Button
          variant="outline"
          type="button"
          aria-label={isEn ? 'Add Portfolio' : '新增持仓'}
          disabled={portfolios.length >= 5}
          onClick={addPortfolio}
        >
          <Plus aria-hidden="true" data-icon="inline-start" />
          {isEn ? 'Add Portfolio' : '新增持仓'}
        </Button>
        <span className="text-xs text-muted-foreground">
          {portfolios.length >= 5
            ? (isEn ? 'Max 5 portfolios' : '最多 5 组')
            : (isEn ? `${portfolios.length} / 5 portfolios` : `当前 ${portfolios.length} / 5 组`)}
        </span>
      </div>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button className="w-full sm:w-auto" type="submit">
        {running
          ? <><LoaderCircle className="animate-spin" aria-hidden="true" data-icon="inline-start" />{isEn ? 'Comparing…' : '重新对比'}</>
          : <><Scale aria-hidden="true" data-icon="inline-start" />{isEn ? 'Compare Portfolios' : '开始对比'}</>}
      </Button>
    </form>
  )
}
