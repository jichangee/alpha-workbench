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

export interface MarketDataPreview {
  datasetId: string
  symbol: string
  start: string
  end: string
  rows: number
  warnings: string[]
}

export interface BacktestResponse {
  metadata: {
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
  metrics: Record<string, number | null>
  series: Record<string, Array<number | string | null>>
  indicators: Record<string, Array<number | null>>
  fills: Array<Record<string, unknown>>
  trades: Array<Record<string, unknown>>
  warnings: string[]
}

export interface ApiProblem {
  code: string
  message: string
  fields: Record<string, string>
}
