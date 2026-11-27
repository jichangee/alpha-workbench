import { formatCurrency, formatPercent, formatSignedCurrency } from '../formatters'
import type { BacktestTrade } from '../types'
import { Alert, AlertDescription } from './ui/alert'
import { Badge } from './ui/badge'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table'
import { cn } from '../lib/utils'

interface TradesTableProps {
  trades: BacktestTrade[]
}

export function TradesTable({ trades }: TradesTableProps) {
  const hasOpenPosition = trades.some((trade) => trade.isOpen)

  if (trades.length === 0) {
    return (
      <Alert className="border-dashed bg-muted/20" role="status">
        <AlertDescription className="text-center">尚无交易记录</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-4">
      {hasOpenPosition && (
        <Alert className="border-primary/30 bg-primary/5" role="status">
          <AlertDescription className="text-primary">当前持仓尚未平仓</AlertDescription>
        </Alert>
      )}
      <div tabIndex={0} aria-label="交易明细，可横向滚动">
        <Table className="min-w-[860px] font-mono text-xs">
          <TableCaption className="sr-only">交易明细</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>状态</TableHead><TableHead>标的</TableHead><TableHead>入场日期</TableHead><TableHead>出场日期</TableHead><TableHead>入场价</TableHead><TableHead>出场价</TableHead><TableHead>数量</TableHead><TableHead>毛盈亏</TableHead><TableHead>成本</TableHead><TableHead>净盈亏</TableHead><TableHead>收益率</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
          {trades.map((trade, index) => (
            <TableRow key={`${trade.entryDate}-${trade.exitDate}-${index}`}>
              <TableCell>
                <Badge variant={trade.isOpen ? 'outline' : 'secondary'}>{trade.isOpen ? '持仓中' : '已平仓'}</Badge>
              </TableCell>
              <TableCell>{trade.symbol ?? '—'}</TableCell>
              <TableCell>{trade.entryDate}</TableCell>
              <TableCell>{trade.isOpen ? '—' : trade.exitDate ?? '—'}</TableCell>
              <TableCell>{formatCurrency(trade.entryPrice)}</TableCell>
              <TableCell>{trade.isOpen ? '—' : formatCurrency(trade.exitPrice)}</TableCell>
              <TableCell>{trade.shares.toLocaleString('en-US')}</TableCell>
              <TableCell className={cn(trade.grossPnl !== null && (trade.grossPnl >= 0 ? 'text-emerald-700' : 'text-red-700'))}>{formatSignedCurrency(trade.isOpen ? null : trade.grossPnl)}</TableCell>
              <TableCell>{formatCurrency(trade.costs)}</TableCell>
              <TableCell className={cn(trade.netPnl !== null && (trade.netPnl >= 0 ? 'text-emerald-700' : 'text-red-700'))}>{formatSignedCurrency(trade.isOpen ? null : trade.netPnl)}</TableCell>
              <TableCell className={cn(trade.returnPct !== null && (trade.returnPct >= 0 ? 'text-emerald-700' : 'text-red-700'))}>{formatPercent(trade.isOpen ? null : trade.returnPct)}</TableCell>
            </TableRow>
          ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
