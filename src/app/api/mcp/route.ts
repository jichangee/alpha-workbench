import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'
import { runBacktest } from '@/lib/server/backtests'
import { STRATEGIES } from '@/lib/server/catalog'
import { loadYahooBars, type MarketBar } from '@/lib/server/market-data'
import { calculatePortfolioComparison } from '@/lib/server/portfolio-comparison'

function isAuthorized(request: Request): boolean {
  const token = process.env.MCP_AUTH_TOKEN?.trim()
  if (!token) return true
  const authHeader = request.headers.get('authorization') ?? ''
  return authHeader === `Bearer ${token}`
}

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'alpha-workbench',
    version: '2.0.0',
  })

  server.tool(
    'list_strategies',
    '列出所有可用的美股回测策略及其参数说明、默认值与校验规则。',
    {},
    async () => ({
      content: [{ type: 'text', text: JSON.stringify(STRATEGIES, null, 2) }],
    }),
  )

  server.tool(
    'get_market_data',
    '从 Yahoo Finance 获取指定美股标的的历史日线 OHLC 行情数据。',
    {
      symbol: z.string().min(1).describe('美股代码，例如 AAPL、SPY、QQQ'),
      start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('开始日期 YYYY-MM-DD'),
      end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('结束日期 YYYY-MM-DD'),
      limit: z.number().int().min(1).max(500).optional().describe('可选，返回最近 N 条记录以控制上下文长度'),
    },
    async ({ symbol, start, end, limit }) => {
      const bars = await loadYahooBars(symbol, start, end)
      const sliced = limit ? bars.slice(-limit) : bars
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                symbol: symbol.trim().toUpperCase(),
                start: bars[0].date,
                end: bars[bars.length - 1].date,
                totalRows: bars.length,
                returnedRows: sliced.length,
                bars: sliced,
              },
              null,
              2,
            ),
          },
        ],
      }
    },
  )

  server.tool(
    'run_backtest',
    '运行无状态美股策略回测，返回绩效指标（总收益、CAGR、夏普、最大回撤、胜率）、交易记录与可选净值序列。',
    {
      symbol: z.string().min(1).describe('主标的美股代码，例如 AAPL、SPY'),
      start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('开始日期 YYYY-MM-DD'),
      end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('结束日期 YYYY-MM-DD'),
      strategyKey: z
        .enum(['buy_hold', 'sma_cross', 'rsi_reversal', 'donchian'])
        .describe('策略标识'),
      params: z
        .record(z.string(), z.number())
        .optional()
        .default({})
        .describe('策略参数，例如 { short_window: 20, long_window: 50 }'),
      positionMode: z.enum(['cash', 'rotate']).optional().default('cash').describe('空仓模式：cash 持有现金，rotate 轮动到替代标的'),
      alternateSymbol: z.string().optional().describe('positionMode 为 rotate 时的替代标的代码，例如 TLT、SGOV'),
      initialCash: z.number().positive().optional().default(100000).describe('初始资金，默认 100000'),
      commission: z.number().min(0).optional().default(0).describe('每笔佣金，默认 0'),
      slippageBps: z.number().min(0).lt(10000).optional().default(5).describe('滑点（基点），默认 5'),
      includeSeries: z.boolean().optional().default(false).describe('是否包含完整逐日净值序列（默认 false 以节省 token）'),
    },
    async ({
      symbol,
      start,
      end,
      strategyKey,
      params,
      positionMode,
      alternateSymbol,
      initialCash,
      commission,
      slippageBps,
      includeSeries,
    }) => {
      const result = await runBacktest({
        symbol,
        start,
        end,
        positionMode,
        alternateSymbol: alternateSymbol ?? null,
        strategy: { key: strategyKey, params },
        initialCash,
        commission,
        slippageBps,
      })

      const payload = includeSeries
        ? result
        : {
            metadata: result.metadata,
            metrics: result.metrics,
            trades: result.trades,
            fillsCount: result.fills.length,
            warnings: result.warnings,
          }

      return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      }
    },
  )

  server.tool(
    'compare_portfolios',
    '对比 2 到 5 组美股资产配置组合在相同历史区间的绩效指标（收益、CAGR、波动率、夏普、最大回撤与再平衡日期）。',
    {
      start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('开始日期 YYYY-MM-DD'),
      end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('结束日期 YYYY-MM-DD'),
      portfolios: z
        .array(
          z.object({
            name: z.string().min(1).max(40),
            positions: z.array(
              z.object({
                symbol: z.string().min(1).max(15),
                weight: z.number().positive().describe('权重（0-1 之间，同一组合权重和为 1）'),
              }),
            ),
            rebalanceFrequency: z
              .enum(['none', 'monthly', 'quarterly', 'yearly', 'threshold'])
              .optional()
              .default('none'),
            rebalanceThreshold: z.number().gt(0).lte(100).optional().default(5),
          }),
        )
        .min(2)
        .max(5),
      includeSeries: z.boolean().optional().default(false).describe('是否包含逐日净值数组'),
    },
    async ({ start, end, portfolios, includeSeries }) => {
      const normalizedPortfolios = portfolios.map((p) => ({
        ...p,
        positions: p.positions.map((pos) => ({
          symbol: pos.symbol.trim().toUpperCase(),
          weight: pos.weight,
        })),
      }))

      const symbols = Array.from(
        new Set(normalizedPortfolios.flatMap((p) => p.positions.map((pos) => pos.symbol))),
      )
      const entries = await Promise.all(
        symbols.map(async (sym) => [sym, await loadYahooBars(sym, start, end)] as const),
      )
      const barsBySymbol: Record<string, MarketBar[]> = Object.fromEntries(entries)
      const comparison = calculatePortfolioComparison(
        { start, end, portfolios: normalizedPortfolios },
        barsBySymbol,
      )

      const payload = includeSeries
        ? comparison
        : {
            start: comparison.start,
            end: comparison.end,
            tradingDays: comparison.dates.length,
            portfolios: comparison.portfolios.map(({ equity: _equity, ...rest }) => rest),
          }

      return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      }
    },
  )

  return server
}

async function handleMcpRequest(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  const server = createMcpServer()
  await server.connect(transport)

  try {
    return await transport.handleRequest(request)
  } finally {
    await server.close()
  }
}

export async function GET(request: Request) {
  return handleMcpRequest(request)
}

export async function POST(request: Request) {
  return handleMcpRequest(request)
}

export async function DELETE(request: Request) {
  return handleMcpRequest(request)
}
