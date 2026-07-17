import type { PortfolioComparisonMetrics, PortfolioComparisonResponse } from '../types'
import { formatPercent } from '../formatters'
import { PortfolioComparisonChart } from './PortfolioComparisonChart'

interface PortfolioComparisonResultsProps {
  result: PortfolioComparisonResponse
}

const metricRows: Array<{ key: keyof PortfolioComparisonMetrics; label: string }> = [
  { key: 'totalReturn', label: '累计收益' },
  { key: 'cagr', label: '年化收益' },
  { key: 'annualizedVolatility', label: '年化波动率' },
  { key: 'maxDrawdown', label: '最大回撤' },
]

function weightLabel(weight: number): string {
  const percent = weight * 100
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}%`
}

export function PortfolioComparisonResults({ result }: PortfolioComparisonResultsProps) {
  return (
    <section className="portfolio-results" aria-label="持仓对比结果">
      <header className="results-heading portfolio-results-heading">
        <div>
          <p className="eyebrow">PORTFOLIO RESULTS</p>
          <h2>历史走势对比</h2>
        </div>
        <p>{result.start} 至 {result.end} · {result.dates.length} 个共同交易日</p>
      </header>

      <div className="portfolio-summary-grid">
        {result.portfolios.map((portfolio, index) => (
          <article className={`portfolio-summary portfolio-tone-${index + 1}`} key={`${portfolio.name}-${index}`}>
            <p>持仓 {index + 1}</p>
            <h3>{portfolio.name}</h3>
            <div className="composition-list" aria-label={`${portfolio.name}构成`}>
              {portfolio.positions.map((position) => (
                <span key={position.symbol}>{position.symbol} {weightLabel(position.weight)}</span>
              ))}
            </div>
          </article>
        ))}
      </div>

      <section className="chart-card portfolio-chart-card" aria-labelledby="portfolio-chart-heading">
        <div className="chart-card-header">
          <div>
            <h3 id="portfolio-chart-heading">归一化净值</h3>
            <p>两组起点均为 100，之后权重随价格自然漂移。</p>
          </div>
        </div>
        <PortfolioComparisonChart result={result} />
      </section>

      <section className="portfolio-metrics-card" aria-labelledby="portfolio-metrics-heading">
        <div>
          <p className="eyebrow">RISK & RETURN</p>
          <h3 id="portfolio-metrics-heading">关键指标</h3>
        </div>
        <div className="portfolio-table-scroll">
          <table className="portfolio-metric-table">
            <thead>
              <tr>
                <th scope="col">指标</th>
                {result.portfolios.map((portfolio, index) => <th scope="col" key={`${portfolio.name}-${index}`}>{portfolio.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {metricRows.map((metric) => (
                <tr key={metric.key}>
                  <th scope="row">{metric.label}</th>
                  {result.portfolios.map((portfolio, index) => (
                    <td key={`${metric.key}-${index}`}>{formatPercent(portfolio.metrics[metric.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}
