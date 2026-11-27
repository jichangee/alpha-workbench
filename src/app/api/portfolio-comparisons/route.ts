import { NextResponse } from 'next/server'
import { z } from 'zod'
import { loadYahooBars, MarketDataError, type MarketBar } from '@/lib/server/market-data'
import {
  calculatePortfolioComparison,
  PortfolioComparisonError,
} from '@/lib/server/portfolio-comparison'

const PositionSchema = z.object({
  symbol: z.string().trim().min(1).max(15).transform((s) => s.toUpperCase()),
  weight: z.number().finite().positive(),
})

const PortfolioSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    positions: z.array(PositionSchema).min(1).max(8),
    rebalanceFrequency: z
      .enum(['none', 'monthly', 'quarterly', 'yearly', 'threshold'])
      .default('none'),
    rebalanceThreshold: z.number().finite().gt(0).lte(100).default(5),
  })
  .superRefine((portfolio, ctx) => {
    const symbols = portfolio.positions.map((p) => p.symbol)
    if (new Set(symbols).size !== symbols.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['positions'],
        message: '同一持仓不能重复添加股票',
      })
    }
    const weightSum = portfolio.positions.reduce((acc, p) => acc + p.weight, 0)
    if (Math.abs(weightSum - 1) > 1e-6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['positions'],
        message: '每组持仓权重合计必须为 100%',
      })
    }
  })

const PortfolioComparisonRequestSchema = z
  .object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    portfolios: z.array(PortfolioSchema).min(2).max(5),
  })
  .superRefine((data, ctx) => {
    const today = new Date().toISOString().slice(0, 10)
    if (data.start > data.end) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['end'],
        message: '结束日期不能早于开始日期',
      })
    }
    if (data.end > today) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['end'],
        message: '结束日期不能晚于今天',
      })
    }
  })

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { code: 'VALIDATION_ERROR', message: '请求参数无效', fields: {} },
      { status: 422 },
    )
  }

  const parsed = PortfolioComparisonRequestSchema.safeParse(body)
  if (!parsed.success) {
    const fields: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      fields[issue.path.join('.')] = issue.message || '输入不合法'
    }
    return NextResponse.json(
      { code: 'VALIDATION_ERROR', message: '请求参数无效', fields },
      { status: 422 },
    )
  }

  const symbols = Array.from(
    new Set(parsed.data.portfolios.flatMap((portfolio) => portfolio.positions.map((p) => p.symbol))),
  )

  try {
    const entries = await Promise.all(
      symbols.map(async (symbol) => [
        symbol,
        await loadYahooBars(symbol, parsed.data.start, parsed.data.end),
      ] as const),
    )
    const barsBySymbol: Record<string, MarketBar[]> = Object.fromEntries(entries)
    const result = calculatePortfolioComparison(parsed.data, barsBySymbol)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof MarketDataError) {
      return NextResponse.json(
        { code: 'MARKET_DATA_ERROR', message: error.message, fields: {} },
        { status: 400 },
      )
    }
    if (error instanceof PortfolioComparisonError) {
      return NextResponse.json(
        { code: 'PORTFOLIO_COMPARISON_ERROR', message: error.message, fields: {} },
        { status: 400 },
      )
    }
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: '持仓对比执行失败，请稍后重试', fields: {} },
      { status: 500 },
    )
  }
}
