import { type FormEvent, useRef, useState } from 'react'
import type { PortfolioComparisonInput, PortfolioDefinitionInput } from '../types'

interface PortfolioComparisonFormProps {
  onCompare: (input: PortfolioComparisonInput) => void
  disabled: boolean
}

interface PositionDraft {
  id: number
  symbol: string
  weight: string
}

interface PortfolioDraft {
  name: string
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
    end: localDate(new Date(lastCompleteYear, 11, 31)),
  }
}

const initialPortfolios: [PortfolioDraft, PortfolioDraft] = [
  {
    name: '持仓 1',
    positions: [
      { id: 1, symbol: 'VOO', weight: '50' },
      { id: 2, symbol: 'QQQ', weight: '50' },
    ],
  },
  {
    name: '持仓 2',
    positions: [{ id: 3, symbol: 'SOXX', weight: '100' }],
  },
]

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
): string | undefined {
  if (!start || !end) return '请输入开始和结束日期。'
  if (start > end) return '结束日期不能早于开始日期。'
  if (end > localDate(new Date())) return '结束日期不能晚于今天。'

  for (const portfolio of portfolios) {
    if (!portfolio.name.trim()) return '请输入持仓名称。'
    const symbols = portfolio.positions.map((position) => position.symbol.trim().toUpperCase())
    if (symbols.some((symbol) => !symbol)) return '请输入股票代码。'
    if (new Set(symbols).size !== symbols.length) return '同一持仓不能重复添加股票。'
    if (portfolio.positions.some((position) => {
      const weight = Number(position.weight)
      return !Number.isFinite(weight) || weight <= 0
    })) return '每只股票的权重必须大于 0。'
    if (Math.abs(totalWeight(portfolio) - 100) > 0.0001) {
      return '每组持仓权重合计必须为 100%。'
    }
  }
}

export function PortfolioComparisonForm({ onCompare, disabled }: PortfolioComparisonFormProps) {
  const [{ start: initialStart, end: initialEnd }] = useState(initialDates)
  const [start, setStart] = useState(initialStart)
  const [end, setEnd] = useState(initialEnd)
  const [portfolios, setPortfolios] = useState<PortfolioDraft[]>(initialPortfolios)
  const [error, setError] = useState<string>()
  const nextPositionId = useRef(4)

  const updatePortfolio = (portfolioIndex: number, update: (portfolio: PortfolioDraft) => PortfolioDraft) => {
    setPortfolios((current) => current.map((portfolio, index) => (
      index === portfolioIndex ? update(portfolio) : portfolio
    )))
    setError(undefined)
  }

  const updatePosition = (
    portfolioIndex: number,
    positionId: number,
    field: 'symbol' | 'weight',
    value: string,
  ) => updatePortfolio(portfolioIndex, (portfolio) => ({
    ...portfolio,
    positions: portfolio.positions.map((position) => (
      position.id === positionId ? { ...position, [field]: value } : position
    )),
  }))

  const addPosition = (portfolioIndex: number) => updatePortfolio(portfolioIndex, (portfolio) => ({
    ...portfolio,
    positions: portfolio.positions.length >= 8 ? portfolio.positions : [
      ...portfolio.positions,
      { id: nextPositionId.current++, symbol: '', weight: '0' },
    ],
  }))

  const removePosition = (portfolioIndex: number, positionId: number) => updatePortfolio(
    portfolioIndex,
    (portfolio) => ({
      ...portfolio,
      positions: portfolio.positions.length === 1
        ? portfolio.positions
        : portfolio.positions.filter((position) => position.id !== positionId),
    }),
  )

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const validationError = validate(start, end, portfolios)
    if (validationError) {
      setError(validationError)
      return
    }

    const normalized = portfolios.map<PortfolioDefinitionInput>((portfolio) => ({
      name: portfolio.name.trim(),
      positions: portfolio.positions.map((position) => ({
        symbol: position.symbol.trim().toUpperCase(),
        weight: Number(position.weight) / 100,
      })),
    }))
    onCompare({
      start,
      end,
      portfolios: [normalized[0], normalized[1]],
    })
  }

  return (
    <form className="portfolio-form" onSubmit={submit} noValidate>
      <div className="section-heading">
        <div>
          <p className="eyebrow">PORTFOLIOS</p>
          <h2>编辑两组持仓</h2>
        </div>
        <p>首日按权重买入，之后不再平衡。</p>
      </div>

      <div className="portfolio-date-grid">
        <label>
          <span>开始日期</span>
          <input aria-label="对比开始日期" type="date" value={start} max={end} onChange={(event) => { setStart(event.target.value); setError(undefined) }} />
        </label>
        <label>
          <span>结束日期</span>
          <input aria-label="对比结束日期" type="date" value={end} min={start} max={localDate(new Date())} onChange={(event) => { setEnd(event.target.value); setError(undefined) }} />
        </label>
      </div>

      <div className="portfolio-editor-grid">
        {portfolios.map((portfolio, portfolioIndex) => {
          const total = totalWeight(portfolio)
          const totalIsValid = Math.abs(total - 100) <= 0.0001
          return (
            <section className="portfolio-card" key={portfolioIndex} aria-label={`持仓 ${portfolioIndex + 1} 编辑器`}>
              <label className="portfolio-name-field">
                <span>持仓名称</span>
                <input
                  aria-label={`持仓 ${portfolioIndex + 1} 名称`}
                  value={portfolio.name}
                  maxLength={40}
                  onChange={(event) => updatePortfolio(portfolioIndex, (current) => ({ ...current, name: event.target.value }))}
                />
              </label>

              <div className="position-column-labels" aria-hidden="true">
                <span>股票代码</span><span>权重</span><span />
              </div>
              {portfolio.positions.map((position, positionIndex) => (
                <div className="position-row" key={position.id}>
                  <input
                    aria-label={`持仓 ${portfolioIndex + 1} 第 ${positionIndex + 1} 只股票代码`}
                    value={position.symbol}
                    maxLength={15}
                    placeholder="如 VOO"
                    autoCapitalize="characters"
                    onChange={(event) => updatePosition(portfolioIndex, position.id, 'symbol', event.target.value.toUpperCase())}
                  />
                  <label className="weight-input">
                    <input
                      aria-label={`持仓 ${portfolioIndex + 1} 第 ${positionIndex + 1} 只股票权重`}
                      type="number"
                      min="0.01"
                      max="100"
                      step="0.01"
                      value={position.weight}
                      onChange={(event) => updatePosition(portfolioIndex, position.id, 'weight', event.target.value)}
                    />
                    <span>%</span>
                  </label>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`删除持仓 ${portfolioIndex + 1} 第 ${positionIndex + 1} 只股票`}
                    disabled={portfolio.positions.length === 1}
                    onClick={() => removePosition(portfolioIndex, position.id)}
                  >
                    ×
                  </button>
                </div>
              ))}

              <div className="portfolio-card-footer">
                <button
                  className="text-button"
                  type="button"
                  aria-label={`为持仓 ${portfolioIndex + 1} 添加股票`}
                  disabled={portfolio.positions.length >= 8}
                  onClick={() => addPosition(portfolioIndex)}
                >
                  + 添加股票
                </button>
                <span className={`weight-total${totalIsValid ? '' : ' invalid'}`}>
                  合计 {formattedTotal(total)}%
                </span>
              </div>
            </section>
          )
        })}
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-action" type="submit">
        {disabled ? '重新对比' : '开始对比'}
      </button>
    </form>
  )
}
