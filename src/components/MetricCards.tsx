import { formatCurrency, formatInteger, formatNumber, formatPercent } from '../formatters'
import { useI18n } from '../i18n'
import type { BacktestMetrics } from '../types'
import { Card, CardContent } from './ui/card'
import { cn } from '../lib/utils'

interface MetricCardsProps {
  metrics: BacktestMetrics
}

interface MetricDefinition {
  label: string
  value: string
  tone?: 'positive' | 'negative'
}

function metricTone(value: number | null): MetricDefinition['tone'] {
  if (value === null || value === 0) return undefined
  return value > 0 ? 'positive' : 'negative'
}

export function MetricCards({ metrics }: MetricCardsProps) {
  const { locale } = useI18n()
  const isEn = locale === 'en'

  const cards: MetricDefinition[] = [
    { label: isEn ? 'Ending Equity' : '期末净值', value: formatCurrency(metrics.endingEquity), tone: metricTone(metrics.totalReturn) },
    { label: isEn ? 'Total Return' : '总收益率', value: formatPercent(metrics.totalReturn), tone: metricTone(metrics.totalReturn) },
    { label: isEn ? 'CAGR' : '年化收益率', value: formatPercent(metrics.cagr), tone: metricTone(metrics.cagr) },
    { label: isEn ? 'Annualized Volatility' : '年化波动率', value: formatPercent(metrics.annualizedVolatility) },
    { label: isEn ? 'Sharpe Ratio' : '夏普比率', value: formatNumber(metrics.sharpeRatio), tone: metricTone(metrics.sharpeRatio) },
    { label: isEn ? 'Max Drawdown' : '最大回撤', value: formatPercent(metrics.maxDrawdown), tone: metricTone(metrics.maxDrawdown) },
    { label: isEn ? 'Closed Trades' : '已平仓交易', value: formatInteger(metrics.tradeCount) },
    { label: isEn ? 'Win Rate' : '胜率', value: formatPercent(metrics.winRate), tone: metricTone(metrics.winRate) },
  ]

  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={isEn ? 'Key performance metrics' : '关键绩效指标'}>
      {cards.map((card) => (
        <Card size="sm" className="bg-muted/20" key={card.label}>
          <CardContent>
            <p className="text-xs font-medium tracking-wide text-muted-foreground">{card.label}</p>
            <strong className={cn(
              'mt-2 block font-mono text-lg font-semibold tabular-nums',
              card.tone === 'positive' && 'text-emerald-700',
              card.tone === 'negative' && 'text-red-700',
            )}>
              {card.value}
            </strong>
          </CardContent>
        </Card>
      ))}
    </section>
  )
}
