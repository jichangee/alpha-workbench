import { Impit } from 'impit'
import Papa from 'papaparse'

export interface MarketBar {
  date: string
  open: number
  high: number
  low: number
  close: number
}

export class MarketDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MarketDataError'
  }
}

const PRICE_RANGE_RTOL = Number.EPSILON * 8

const globalCache = globalThis as unknown as {
  __huiceMarketDataCache?: Map<string, MarketBar[]>
}

function getCache(): Map<string, MarketBar[]> {
  if (!globalCache.__huiceMarketDataCache) {
    globalCache.__huiceMarketDataCache = new Map()
  }
  return globalCache.__huiceMarketDataCache
}

function toIsoDate(raw: unknown): string {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) throw new MarketDataError('日期格式无效')
    return raw.toISOString().slice(0, 10)
  }
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw new MarketDataError('日期格式无效')
  }
  const text = String(raw).trim()
  if (!text) throw new MarketDataError('日期格式无效')
  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})/)
  if (isoMatch) {
    const parsed = new Date(`${isoMatch[1]}T00:00:00Z`)
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === isoMatch[1]) {
      return isoMatch[1]
    }
  }
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) {
    throw new MarketDataError('日期格式无效')
  }
  return parsed.toISOString().slice(0, 10)
}

function toNumber(raw: unknown): number {
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string' && raw.trim() !== '') return Number(raw)
  return NaN
}

function isClose(a: number, b: number): boolean {
  return Math.abs(a - b) <= PRICE_RANGE_RTOL * Math.max(Math.abs(a), Math.abs(b))
}

function outsidePriceRange(price: number, low: number, high: number): boolean {
  return (price < low && !isClose(price, low)) || (price > high && !isClose(price, high))
}

function clip(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

export function normalizeBars(rows: Array<Record<string, unknown>>): MarketBar[] {
  if (rows.length === 0) {
    throw new MarketDataError('行情数据不能为空')
  }

  const byDate = new Map<string, MarketBar>()
  let hasCheckedColumns = false

  for (const rawRow of rows) {
    const normalized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(rawRow)) {
      const titleKey = key.trim().toLowerCase()
      normalized[titleKey] = value
    }

    if (!hasCheckedColumns) {
      if (!('date' in normalized)) {
        throw new MarketDataError('缺少日期列')
      }
      const missing = ['open', 'high', 'low', 'close']
        .filter((col) => !(col in normalized))
        .map((col) => col[0].toUpperCase() + col.slice(1))
      if (missing.length > 0) {
        throw new MarketDataError(`缺少必需行情列：${missing.join(', ')}`)
      }
      hasCheckedColumns = true
    }

    const date = toIsoDate(normalized.date)
    const open = toNumber(normalized.open)
    const high = toNumber(normalized.high)
    const low = toNumber(normalized.low)
    const close = toNumber(normalized.close)

    if (![open, high, low, close].every((v) => Number.isFinite(v))) {
      throw new MarketDataError('行情价格必须是数字')
    }
    if (open <= 0 || high <= 0 || low <= 0 || close <= 0) {
      throw new MarketDataError('行情价格必须大于 0')
    }
    if (high < low) {
      throw new MarketDataError('最高价必须不低于最低价')
    }
    if (outsidePriceRange(open, low, high)) {
      throw new MarketDataError('开盘价必须位于最高价和最低价之间')
    }
    if (outsidePriceRange(close, low, high)) {
      throw new MarketDataError('收盘价必须位于最高价和最低价之间')
    }

    byDate.set(date, {
      date,
      open: clip(open, low, high),
      high,
      low,
      close: clip(close, low, high),
    })
  }

  const bars = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
  if (bars.length === 0) {
    throw new MarketDataError('行情数据不能为空')
  }
  return bars
}

export function parseCsvBars(csvText: string): MarketBar[] {
  const trimmed = csvText.trim()
  if (!trimmed) {
    throw new MarketDataError('CSV 文件不能为空')
  }
  const parsed = Papa.parse<Record<string, unknown>>(trimmed, {
    header: true,
    skipEmptyLines: true,
  })
  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new MarketDataError('CSV 文件格式或编码无效')
  }
  return normalizeBars(parsed.data)
}

function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function toUnixSeconds(isoDate: string): number {
  return Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / 1000)
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        exchangeTimezoneName?: string
        gmtoffset?: number
      }
      timestamp?: number[]
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>
          high?: Array<number | null>
          low?: Array<number | null>
          close?: Array<number | null>
        }>
        adjclose?: Array<{
          adjclose?: Array<number | null>
        }>
      }
    }> | null
    error?: { code?: string; description?: string } | null
  }
}

function timestampToExchangeDate(unixSeconds: number, gmtoffsetSeconds: number): string {
  const shifted = new Date((unixSeconds + gmtoffsetSeconds) * 1000)
  return shifted.toISOString().slice(0, 10)
}

export async function loadYahooBars(symbol: string, start: string, end: string): Promise<MarketBar[]> {
  const normalizedSymbol = symbol.trim().toUpperCase()
  const cacheKey = `${normalizedSymbol}_${start}_${end}`
  const cache = getCache()
  const cached = cache.get(cacheKey)
  if (cached) {
    return cached
  }

  const period1 = toUnixSeconds(start)
  const period2 = toUnixSeconds(addDaysIso(end, 1))
  const query = `period1=${period1}&period2=${period2}&interval=1d&events=div,split`
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalizedSymbol)}?${query}`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalizedSymbol)}?${query}`,
  ]

  const impit = new Impit({ browser: 'chrome' })
  let payload: YahooChartResponse | null = null

  for (const url of urls) {
    try {
      const response = await impit.fetch(url)
      if (!response.ok) continue
      payload = (await response.json()) as YahooChartResponse
      break
    } catch {
      // Try next host
    }
  }

  if (!payload) {
    throw new MarketDataError('无法下载行情数据，请检查股票代码、日期范围或网络连接')
  }

  const result = payload.chart?.result?.[0]
  const timestamps = result?.timestamp ?? []
  const quote = result?.indicators?.quote?.[0]
  const adjclose = result?.indicators?.adjclose?.[0]?.adjclose

  if (!result || !quote || timestamps.length === 0) {
    throw new MarketDataError('未获取到行情数据，请检查股票代码、日期范围或网络连接')
  }

  const gmtoffset = result.meta?.gmtoffset ?? 0
  const rawRows: Array<Record<string, unknown>> = []

  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i]
    const open = quote.open?.[i]
    const high = quote.high?.[i]
    const low = quote.low?.[i]
    const close = quote.close?.[i]
    if (ts == null || open == null || high == null || low == null || close == null) {
      continue
    }
    const adj = adjclose?.[i]
    const factor = adj != null && close > 0 ? adj / close : 1
    rawRows.push({
      date: timestampToExchangeDate(ts, gmtoffset),
      open: open * factor,
      high: high * factor,
      low: low * factor,
      close: close * factor,
    })
  }

  if (rawRows.length === 0) {
    throw new MarketDataError('未获取到行情数据，请检查股票代码、日期范围或网络连接')
  }

  const bars = normalizeBars(rawRows).filter((bar) => bar.date >= start && bar.date <= end)
  if (bars.length === 0) {
    throw new MarketDataError('未获取到行情数据，请检查股票代码、日期范围或网络连接')
  }

  cache.set(cacheKey, bars)
  return bars
}
