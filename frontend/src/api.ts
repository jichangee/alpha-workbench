import type {
  ApiProblem,
  BacktestResponse,
  FormState,
  MarketDataPreview,
  StrategyDefinition,
} from './types'

export class ApiError extends Error {
  readonly fields: Record<string, string>

  constructor(problem: ApiProblem) {
    super(problem.message)
    this.name = 'ApiError'
    this.fields = problem.fields
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, init)
  if (response.ok) {
    return response.json() as Promise<T>
  }

  let problem: ApiProblem = {
    code: 'REQUEST_ERROR',
    message: '请求未能完成，请稍后重试。',
    fields: {},
  }
  try {
    problem = { ...problem, ...(await response.json() as Partial<ApiProblem>) }
  } catch {
    // A network gateway can return non-JSON errors; retain the useful fallback.
  }
  throw new ApiError(problem)
}

type StrategyWire = Omit<StrategyDefinition, 'validationRules'> & {
  validationRules?: StrategyDefinition['validationRules']
  validation_rules?: StrategyDefinition['validationRules']
}

export async function fetchStrategies(signal?: AbortSignal): Promise<StrategyDefinition[]> {
  const catalog = await request<StrategyWire[]>('/api/strategies', { signal })
  return catalog.map(({ validation_rules, validationRules, ...strategy }) => ({
    ...strategy,
    validationRules: validationRules ?? validation_rules ?? [],
  }))
}

export async function previewMarketData(
  input: FormState,
  signal?: AbortSignal,
): Promise<MarketDataPreview> {
  const body = new FormData()
  body.set('source', input.source)
  if (input.source === 'csv') {
    if (input.file) body.set('file', input.file)
    if (input.symbol.trim()) body.set('symbol', input.symbol.trim())
  } else {
    body.set('symbol', input.symbol.trim())
    body.set('start', input.start)
    body.set('end', input.end)
  }
  return request<MarketDataPreview>('/api/market-data/preview', {
    method: 'POST',
    body,
    signal,
  })
}

export function toBacktestRequest(input: FormState, datasetId: string) {
  return {
    datasetId,
    strategy: { key: input.strategyKey, params: input.params },
    initialCash: input.initialCash,
    commission: input.commission,
    slippageBps: input.slippageBps,
  }
}

export async function runBacktestForDataset(
  input: FormState,
  datasetId: string,
  signal?: AbortSignal,
): Promise<BacktestResponse> {
  return request<BacktestResponse>('/api/backtests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toBacktestRequest(input, datasetId)),
    signal,
  })
}

export async function runBacktest(
  input: FormState,
  signal?: AbortSignal,
): Promise<BacktestResponse> {
  const preview = await previewMarketData(input, signal)
  return runBacktestForDataset(input, preview.datasetId, signal)
}
