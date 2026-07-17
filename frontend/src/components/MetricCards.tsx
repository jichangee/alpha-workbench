import { formatCurrency, formatInteger, formatNumber, formatPercent } from '../formatters'
import type { BacktestMetrics } from '../types'

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
  const cards: MetricDefinition[] = [
    { label: '期末净值', value: formatCurrency(metrics.endingEquity), tone: metricTone(metrics.totalReturn) },
    { label: '总收益率', value: formatPercent(metrics.totalReturn), tone: metricTone(metrics.totalReturn) },
    { label: '年化收益率', value: formatPercent(metrics.cagr), tone: metricTone(metrics.cagr) },
    { label: '年化波动率', value: formatPercent(metrics.annualizedVolatility) },
    { label: '夏普比率', value: formatNumber(metrics.sharpeRatio), tone: metricTone(metrics.sharpeRatio) },
    { label: '最大回撤', value: formatPercent(metrics.maxDrawdown), tone: metricTone(metrics.maxDrawdown) },
    { label: '已平仓交易', value: formatInteger(metrics.tradeCount) },
    { label: '胜率', value: formatPercent(metrics.winRate), tone: metricTone(metrics.winRate) },
  ]

  return (
    <section className="metric-grid" aria-label="关键绩效指标">
      {cards.map((card) => (
        <article className="metric-card" key={card.label}>
          <p>{card.label}</p>
          <strong className={card.tone ? `metric-${card.tone}` : undefined}>{card.value}</strong>
        </article>
      ))}
    </section>
  )
}
