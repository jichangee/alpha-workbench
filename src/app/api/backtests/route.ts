import { NextResponse } from 'next/server'
import { z } from 'zod'
import { BacktestError, BacktestValidationError, runBacktest } from '@/lib/server/backtests'
import { DatasetNotFoundError } from '@/lib/server/dataset-store'
import { MarketDataError } from '@/lib/server/market-data'

const BacktestRequestSchema = z
  .object({
    datasetId: z.string().min(1).optional(),
    symbol: z.string().min(1).optional(),
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    positionMode: z.enum(['cash', 'rotate']).default('cash'),
    alternateDatasetId: z.string().nullable().optional(),
    alternateSymbol: z.string().nullable().optional(),
    strategy: z.object({
      key: z.enum(['buy_hold', 'sma_cross', 'rsi_reversal', 'donchian']),
      params: z.record(z.string(), z.number().finite()).default({}),
    }),
    initialCash: z.number().finite().positive('初始资金必须是有限正数').default(100000),
    commission: z.number().finite().min(0, '佣金必须是有限非负数').default(0),
    slippageBps: z
      .number()
      .finite()
      .min(0, '滑点基点必须在 0（含）到 10000（不含）之间')
      .lt(10000, '滑点基点必须在 0（含）到 10000（不含）之间')
      .default(5),
  })
  .superRefine((data, ctx) => {
    if (data.positionMode === 'rotate' && !data.alternateDatasetId && !data.alternateSymbol) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['alternateDatasetId'],
        message: '换仓模式必须提供替代股票数据集',
      })
    }
    if (!data.datasetId && !(data.symbol && data.start && data.end)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['datasetId'],
        message: '请提供 datasetId 或 symbol/start/end',
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

  const parsed = BacktestRequestSchema.safeParse(body)
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

  try {
    const result = await runBacktest(parsed.data)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof DatasetNotFoundError) {
      return NextResponse.json(
        {
          code: 'DATASET_NOT_FOUND',
          message: '未找到数据集，请重新加载行情数据',
          fields: {},
        },
        { status: 404 },
      )
    }
    if (error instanceof BacktestValidationError) {
      return NextResponse.json(
        { code: 'VALIDATION_ERROR', message: '请求参数无效', fields: error.fields },
        { status: 422 },
      )
    }
    if (error instanceof BacktestError || error instanceof MarketDataError) {
      return NextResponse.json(
        { code: 'BACKTEST_ERROR', message: error.message, fields: {} },
        { status: 400 },
      )
    }
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: '回测执行失败，请稍后重试', fields: {} },
      { status: 500 },
    )
  }
}
