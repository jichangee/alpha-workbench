import { expectTypeOf, it } from 'vitest'
import type {
  BacktestFill,
  BacktestIndicators,
  BacktestMetadata,
  BacktestMetrics,
  BacktestResponse,
  BacktestSeries,
  BacktestTrade,
  MarketDataBarPreview,
  MarketDataPreview,
} from './types'

it('publishes the complete camelCase result contract', () => {
  expectTypeOf<MarketDataPreview['preview'][number]>().toEqualTypeOf<MarketDataBarPreview>()
  expectTypeOf<BacktestResponse['metadata']>().toEqualTypeOf<BacktestMetadata>()
  expectTypeOf<BacktestResponse['metrics']>().toEqualTypeOf<BacktestMetrics>()
  expectTypeOf<BacktestResponse['series']>().toEqualTypeOf<BacktestSeries>()
  expectTypeOf<BacktestResponse['indicators']>().toEqualTypeOf<BacktestIndicators>()
  expectTypeOf<BacktestResponse['fills'][number]>().toEqualTypeOf<BacktestFill>()
  expectTypeOf<BacktestResponse['trades'][number]>().toEqualTypeOf<BacktestTrade>()
})
