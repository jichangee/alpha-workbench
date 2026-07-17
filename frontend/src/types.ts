export type MarketDataSource = 'yahoo' | 'csv'

export interface StrategyParameter {
  key: string
  name: string
  description: string
  type: 'integer' | 'number'
  default: number
  minimum: number
  maximum: number
}

export interface CrossFieldRule {
  expression: string
  message: string
}

export interface StrategyDefinition {
  key: string
  name: string
  description: string
  parameters: readonly StrategyParameter[]
  validationRules: readonly CrossFieldRule[]
}

export interface FormState {
  source: MarketDataSource
  symbol: string
  start: string
  end: string
  file: File | null
  strategyKey: string
  params: Record<string, number>
  initialCash: number
  commission: number
  slippageBps: number
}

export type RunState = 'idle' | 'running' | 'success' | 'error'

export interface MarketDataBarPreview {
  date: string
  open: number
  high: number
  low: number
  close: number
}

export interface MarketDataPreview {
  datasetId: string
  symbol: string
  start: string
  end: string
  rows: number
  preview: MarketDataBarPreview[]
  warnings: string[]
}

export interface BacktestMetadata {
  datasetId: string
  strategyKey: string
  start: string
  end: string
  execution: 'next_open'
  warmup: number
  initialCash: number
  commission: number
  slippageBps: number
}

export interface BacktestMetrics {
  endingEquity: number
  totalReturn: number | null
  cagr: number | null
  annualizedVolatility: number | null
  sharpeRatio: number | null
  maxDrawdown: number | null
  tradeCount: number
  winRate: number | null
}

export interface BacktestSeries {
  dates: string[]
  open: Array<number | null>
  high: Array<number | null>
  low: Array<number | null>
  close: Array<number | null>
  cash: Array<number | null>
  shares: Array<number | null>
  holdings: Array<number | null>
  equity: Array<number | null>
  strategy: Array<number | null>
  benchmark: Array<number | null>
  drawdown: Array<number | null>
  benchmarkDrawdown: Array<number | null>
}

export interface BacktestIndicators {
  [indicator: string]: Array<number | null>
}

export interface BacktestFill {
  date: string
  side: 'buy' | 'sell'
  price: number
  shares: number
  commission: number
  notional: number
}

export interface BacktestTrade {
  entryDate: string
  entryPrice: number
  shares: number
  exitDate: string | null
  exitPrice: number | null
  grossPnl: number | null
  costs: number
  netPnl: number | null
  returnPct: number | null
  isOpen: boolean
}

export interface BacktestResponse {
  metadata: BacktestMetadata
  metrics: BacktestMetrics
  series: BacktestSeries
  indicators: BacktestIndicators
  fills: BacktestFill[]
  trades: BacktestTrade[]
  warnings: string[]
}

export interface ApiProblem {
  code: string
  message: string
  fields: Record<string, string>
}
