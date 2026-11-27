const STRATEGY_LABELS: Record<string, string> = {
  buy_hold: '买入并持有',
  sma_cross: '均线交叉',
  rsi_reversal: 'RSI 反转',
  donchian: '唐奇安通道突破',
}

const INDICATOR_LABELS: Record<string, string> = {
  short_sma: '短期均线',
  long_sma: '长期均线',
  rsi: 'RSI',
  entry_high: '入场通道上轨',
  exit_low: '退出通道下轨',
}

export function strategyLabel(key: string): string {
  return STRATEGY_LABELS[key] ?? key
}

export function indicatorLabel(key: string): string {
  return INDICATOR_LABELS[key] ?? key
}
