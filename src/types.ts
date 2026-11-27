export type MarketDataSource = 'yahoo' | 'csv'
export type PositionMode = 'cash' | 'rotate'
export type RebalanceFrequency = 'none' | 'monthly' | 'quarterly' | 'yearly' | 'threshold'

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
  positionMode: PositionMode
  alternateSymbol: string
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
  execution: 'first_open_then_next_open'
  positionMode?: PositionMode
  primarySymbol?: string
  alternateSymbol?: string | null
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
  positionSymbol?: Array<string | null>
}

export interface BacktestIndicators {
  [indicator: string]: Array<number | null>
}

export interface BacktestFill {
  date: string
  symbol?: string
  side: 'buy' | 'sell'
  price: number
  shares: number
  commission: number
  notional: number
}

export interface BacktestTrade {
  symbol?: string
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

export interface PortfolioPositionInput {
  symbol: string
  weight: number
}

export interface PortfolioDefinitionInput {
  name: string
  rebalanceFrequency: RebalanceFrequency
  rebalanceThreshold?: number
  positions: PortfolioPositionInput[]
}

export interface PortfolioComparisonInput {
  start: string
  end: string
  portfolios: PortfolioDefinitionInput[]
}

export interface PortfolioComparisonMetrics {
  totalReturn: number | null
  cagr: number | null
  annualizedVolatility: number | null
  sharpeRatio: number | null
  maxDrawdown: number | null
}

export interface PortfolioComparisonSeries extends PortfolioDefinitionInput {
  rebalanceDates: string[]
  equity: number[]
  metrics: PortfolioComparisonMetrics
}

export interface PortfolioComparisonResponse {
  start: string
  end: string
  dates: string[]
  portfolios: PortfolioComparisonSeries[]
}

export interface ApiProblem {
  code: string
  message: string
  fields: Record<string, string>
}
