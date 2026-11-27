import { NextResponse } from 'next/server'
import { putDataset } from '@/lib/server/dataset-store'
import { loadYahooBars, MarketDataError, parseCsvBars, type MarketBar } from '@/lib/server/market-data'

const MAX_CSV_BYTES = 10 * 1024 * 1024

function validationError(fields: Record<string, string>) {
  return NextResponse.json(
    { code: 'VALIDATION_ERROR', message: '请求参数无效', fields },
    { status: 422 },
  )
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function POST(request: Request) {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return validationError({ source: '请求表单格式无效' })
  }

  const source = formData.get('source')
  const symbolRaw = formData.get('symbol')
  const symbol = typeof symbolRaw === 'string' ? symbolRaw : ''

  let bars: MarketBar[]
  let normalizedSymbol: string

  if (source === 'csv') {
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return validationError({ file: '请上传 CSV 文件' })
    }
    if (file.size > MAX_CSV_BYTES) {
      return validationError({ file: 'CSV 文件不能超过 10 MiB' })
    }
    try {
      const csvText = await file.text()
      bars = parseCsvBars(csvText)
    } catch (error) {
      if (error instanceof MarketDataError) {
        return validationError({ file: error.message })
      }
      return validationError({ file: 'CSV 文件格式或编码无效' })
    }
    const baseName = (file.name || 'CSV').replace(/\.[^.]+$/, '')
    normalizedSymbol = symbol.trim() ? symbol.trim().toUpperCase() : baseName.toUpperCase()
  } else if (source === 'yahoo') {
    const startRaw = formData.get('start')
    const endRaw = formData.get('end')
    const start = typeof startRaw === 'string' ? startRaw.trim() : ''
    const end = typeof endRaw === 'string' ? endRaw.trim() : ''

    if (!symbol.trim()) {
      return validationError({ symbol: '请输入股票代码' })
    }
    if (!start || !end) {
      return validationError({ start: '请输入开始和结束日期' })
    }
    if (start > end) {
      return validationError({ end: '结束日期不能早于开始日期' })
    }
    if (end > todayIso()) {
      return validationError({ end: '结束日期不能晚于今天' })
    }
    try {
      bars = await loadYahooBars(symbol, start, end)
    } catch (error) {
      return NextResponse.json(
        {
          code: 'MARKET_DATA_ERROR',
          message: error instanceof Error ? error.message : '无法下载行情数据',
          fields: {},
        },
        { status: 400 },
      )
    }
    normalizedSymbol = symbol.trim().toUpperCase()
  } else {
    return validationError({ source: '输入不合法' })
  }

  const firstDate = bars[0].date
  const lastDate = bars[bars.length - 1].date
  const datasetId = putDataset(bars, {
    symbol: normalizedSymbol,
    source,
    start: firstDate,
    end: lastDate,
  })

  return NextResponse.json({
    datasetId,
    symbol: normalizedSymbol,
    start: firstDate,
    end: lastDate,
    rows: bars.length,
    preview: bars.slice(0, 5),
    warnings: [],
  })
}
