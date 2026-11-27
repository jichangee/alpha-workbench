import { lazy, Suspense } from 'react'
import { rebalanceLabel } from '../displayLabels'
import { formatNumber, formatPercent } from '../formatters'
import { useI18n } from '../i18n'
import type {
  PortfolioComparisonMetrics,
  PortfolioComparisonResponse,
} from '../types'
import { Badge } from './ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Skeleton } from './ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table'
import { cn } from '../lib/utils'

const PortfolioComparisonChart = lazy(() => import('./PortfolioComparisonChart').then(
  ({ PortfolioComparisonChart: component }) => ({ default: component }),
))

interface PortfolioComparisonResultsProps {
  result: PortfolioComparisonResponse
}

function weightLabel(weight: number): string {
  const percent = weight * 100
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}%`
}

export function PortfolioComparisonResults({ result }: PortfolioComparisonResultsProps) {
  const { locale } = useI18n()
  const isEn = locale === 'en'

  const metricRows: Array<{ key: keyof PortfolioComparisonMetrics; label: string; format: (value: number | null) => string }> = [
    { key: 'totalReturn', label: isEn ? 'Total Return' : '累计收益', format: formatPercent },
    { key: 'cagr', label: isEn ? 'CAGR' : '年化收益', format: formatPercent },
    { key: 'annualizedVolatility', label: isEn ? 'Annualized Volatility' : '年化波动率', format: formatPercent },
    { key: 'sharpeRatio', label: isEn ? 'Sharpe Ratio' : '夏普比率', format: formatNumber },
    { key: 'maxDrawdown', label: isEn ? 'Max Drawdown' : '最大回撤', format: formatPercent },
  ]

  return (
    <section className="min-w-0 space-y-4" aria-label={isEn ? 'Portfolio comparison results' : '持仓对比结果'}>
      <Card>
        <CardHeader className="border-b md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <Badge variant="outline" className="mb-3 border-primary/40 text-primary">PORTFOLIO RESULTS</Badge>
          <CardTitle className="text-2xl"><h2>{isEn ? 'Historical Comparison' : '历史走势对比'}</h2></CardTitle>
        </div>
        <CardDescription className="mt-3 md:mt-0 md:text-right">
          {isEn
            ? `${result.start} to ${result.end} · ${result.dates.length} common trading days`
            : `${result.start} 至 ${result.end} · ${result.dates.length} 个共同交易日`}
        </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-3 sm:grid-cols-2">
        {result.portfolios.map((portfolio, index) => (
          <Card
            size="sm"
            className={cn(
              'border-t-2 bg-muted/10',
              index === 0 && 'border-t-emerald-400',
              index === 1 && 'border-t-orange-400',
              index === 2 && 'border-t-blue-400',
              index === 3 && 'border-t-fuchsia-400',
              index === 4 && 'border-t-amber-400',
            )}
            key={`${portfolio.name}-${index}`}
          >
            <CardHeader>
              <p className="text-xs font-semibold tracking-widest text-muted-foreground">
                {isEn ? `Portfolio ${index + 1}` : `持仓 ${index + 1}`}
              </p>
              <CardTitle><h3>{portfolio.name}</h3></CardTitle>
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge variant="secondary">{rebalanceLabel(portfolio.rebalanceFrequency, locale)}</Badge>
                {portfolio.rebalanceFrequency === 'threshold' && portfolio.rebalanceThreshold != null && (
                  <Badge variant="outline">
                    {isEn ? `Drift ${portfolio.rebalanceThreshold}%` : `偏离 ${portfolio.rebalanceThreshold}%`}
                  </Badge>
                )}
                <Badge variant="outline">
                  {isEn ? `${portfolio.rebalanceDates.length} rebalances` : `${portfolio.rebalanceDates.length} 次再平衡`}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2" aria-label={isEn ? `${portfolio.name} allocation` : `${portfolio.name}构成`}>
              {portfolio.positions.map((position) => (
                <Badge variant="outline" className="font-mono" key={position.symbol}>
                  {position.symbol} {weightLabel(position.weight)}
                </Badge>
              ))}
            </CardContent>
          </Card>
        ))}
        </CardContent>
      </Card>

      <Card aria-labelledby="portfolio-chart-heading">
        <CardHeader className="border-b">
          <CardTitle id="portfolio-chart-heading"><h3>{isEn ? 'Normalized Equity' : '归一化净值'}</h3></CardTitle>
          <CardDescription>
            {isEn ? 'All portfolios start at 100 and follow their target weights.' : '各组起点均为 100，按各自策略管理目标权重。'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="relative"><Skeleton className="h-[360px] w-full" /><p className="sr-only" role="status">{isEn ? 'Loading chart…' : '正在加载走势图…'}</p></div>}>
            <PortfolioComparisonChart result={result} />
          </Suspense>
        </CardContent>
      </Card>

      <Card aria-labelledby="portfolio-metrics-heading">
        <CardHeader className="border-b">
          <Badge variant="outline" className="mb-2 w-fit">RISK & RETURN</Badge>
          <CardTitle id="portfolio-metrics-heading"><h3>{isEn ? 'Key Metrics' : '关键指标'}</h3></CardTitle>
        </CardHeader>
        <CardContent>
          <Table className="min-w-[480px] font-mono">
            <TableHeader>
              <TableRow>
                <TableHead>{isEn ? 'Metric' : '指标'}</TableHead>
                {result.portfolios.map((portfolio, index) => <TableHead className="text-right" key={`${portfolio.name}-${index}`}>{portfolio.name}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {metricRows.map((metric) => (
                <TableRow key={metric.key}>
                  <TableHead scope="row">{metric.label}</TableHead>
                  {result.portfolios.map((portfolio, index) => (
                    <TableCell className="text-right font-semibold" key={`${metric.key}-${index}`}>{metric.format(portfolio.metrics[metric.key])}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  )
}
