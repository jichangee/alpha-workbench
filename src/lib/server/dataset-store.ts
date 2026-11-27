import { randomUUID } from 'node:crypto'
import type { MarketDataSource } from '@/types'
import { loadYahooBars, type MarketBar } from './market-data'

export interface DatasetMetadata {
  symbol: string
  source: MarketDataSource
  start: string
  end: string
}

interface StoredDataset {
  bars: MarketBar[]
  metadata: DatasetMetadata
}

const globalStore = globalThis as unknown as {
  __huiceDatasetStore?: Map<string, StoredDataset>
}

function getStore(): Map<string, StoredDataset> {
  if (!globalStore.__huiceDatasetStore) {
    globalStore.__huiceDatasetStore = new Map()
  }
  return globalStore.__huiceDatasetStore
}

export class DatasetNotFoundError extends Error {
  constructor(datasetId: string) {
    super(datasetId)
    this.name = 'DatasetNotFoundError'
  }
}

export function putDataset(bars: MarketBar[], metadata: DatasetMetadata): string {
  const datasetId =
    metadata.source === 'yahoo'
      ? `yahoo:${metadata.symbol}:${metadata.start}:${metadata.end}`
      : randomUUID()

  getStore().set(datasetId, {
    bars: bars.map((bar) => ({ ...bar })),
    metadata: { ...metadata },
  })
  return datasetId
}

export async function getDataset(datasetId: string): Promise<StoredDataset> {
  const cached = getStore().get(datasetId)
  if (cached) {
    return {
      bars: cached.bars.map((bar) => ({ ...bar })),
      metadata: { ...cached.metadata },
    }
  }

  if (datasetId.startsWith('yahoo:')) {
    const parts = datasetId.split(':')
    if (parts.length === 4) {
      const [, symbol, start, end] = parts
      if (symbol && start && end) {
        const bars = await loadYahooBars(symbol, start, end)
        const metadata: DatasetMetadata = {
          symbol,
          source: 'yahoo',
          start: bars[0].date,
          end: bars[bars.length - 1].date,
        }
        getStore().set(datasetId, { bars, metadata })
        return {
          bars: bars.map((bar) => ({ ...bar })),
          metadata: { ...metadata },
        }
      }
    }
  }

  throw new DatasetNotFoundError(datasetId)
}
