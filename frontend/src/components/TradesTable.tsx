import { formatCurrency, formatPercent, formatSignedCurrency } from '../formatters'
import type { BacktestTrade } from '../types'

interface TradesTableProps {
  trades: BacktestTrade[]
}

export function TradesTable({ trades }: TradesTableProps) {
  const hasOpenPosition = trades.some((trade) => trade.isOpen)

  if (trades.length === 0) {
    return (
      <p className="table-empty" role="status">
        尚无交易记录
      </p>
    )
  }

  return (
    <>
      {hasOpenPosition && <p className="table-open-status" role="status">当前持仓尚未平仓</p>}
      <div className="table-scroll" tabIndex={0} aria-label="交易明细，可横向滚动">
      <table>
        <caption>交易明细</caption>
        <thead>
          <tr><th scope="col">状态</th><th scope="col">入场日期</th><th scope="col">出场日期</th><th scope="col">入场价</th><th scope="col">出场价</th><th scope="col">数量</th><th scope="col">毛盈亏</th><th scope="col">成本</th><th scope="col">净盈亏</th><th scope="col">收益率</th></tr>
        </thead>
        <tbody>
          {trades.map((trade, index) => (
            <tr key={`${trade.entryDate}-${trade.exitDate}-${index}`}>
              <td>{trade.isOpen ? '持仓中' : '已平仓'}</td><td>{trade.entryDate}</td><td>{trade.isOpen ? '—' : trade.exitDate ?? '—'}</td><td>{formatCurrency(trade.entryPrice)}</td><td>{trade.isOpen ? '—' : formatCurrency(trade.exitPrice)}</td><td>{trade.shares.toLocaleString('en-US')}</td><td className={trade.grossPnl === null ? undefined : trade.grossPnl >= 0 ? 'metric-positive' : 'metric-negative'}>{formatSignedCurrency(trade.isOpen ? null : trade.grossPnl)}</td><td>{formatCurrency(trade.costs)}</td><td className={trade.netPnl === null ? undefined : trade.netPnl >= 0 ? 'metric-positive' : 'metric-negative'}>{formatSignedCurrency(trade.isOpen ? null : trade.netPnl)}</td><td className={trade.returnPct === null ? undefined : trade.returnPct >= 0 ? 'metric-positive' : 'metric-negative'}>{formatPercent(trade.isOpen ? null : trade.returnPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  )
}
