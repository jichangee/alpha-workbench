import { formatCurrency, formatPercent } from '../formatters'
import type { BacktestTrade } from '../types'

interface TradesTableProps {
  trades: BacktestTrade[]
}

export function TradesTable({ trades }: TradesTableProps) {
  const closedTrades = trades.filter((trade) => !trade.isOpen)
  const openTrade = trades.find((trade) => trade.isOpen)

  if (closedTrades.length === 0) {
    return (
      <p className="table-empty" role="status">
        {openTrade ? '当前持仓尚未平仓' : '尚无已平仓交易'}
      </p>
    )
  }

  return (
    <div className="table-scroll" tabIndex={0} aria-label="已平仓交易明细，可横向滚动">
      <table>
        <caption>已平仓交易明细</caption>
        <thead>
          <tr><th scope="col">入场日期</th><th scope="col">出场日期</th><th scope="col">入场价</th><th scope="col">出场价</th><th scope="col">数量</th><th scope="col">净盈亏</th><th scope="col">收益率</th><th scope="col">成本</th></tr>
        </thead>
        <tbody>
          {closedTrades.map((trade, index) => (
            <tr key={`${trade.entryDate}-${trade.exitDate}-${index}`}>
              <td>{trade.entryDate}</td><td>{trade.exitDate ?? '—'}</td><td>{formatCurrency(trade.entryPrice)}</td><td>{formatCurrency(trade.exitPrice)}</td><td>{trade.shares.toLocaleString('en-US')}</td><td className={trade.netPnl === null ? undefined : trade.netPnl >= 0 ? 'metric-positive' : 'metric-negative'}>{formatCurrency(trade.netPnl)}</td><td className={trade.returnPct === null ? undefined : trade.returnPct >= 0 ? 'metric-positive' : 'metric-negative'}>{formatPercent(trade.returnPct)}</td><td>{formatCurrency(trade.costs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
