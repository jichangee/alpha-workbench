import type { Locale } from './i18n'
import type { RebalanceFrequency } from './types'

const STRATEGY_LABELS: Record<Locale, Record<string, string>> = {
  zh: {
    buy_hold: '买入并持有',
    sma_cross: '均线交叉',
    rsi_reversal: 'RSI 反转',
    donchian: '唐奇安通道突破',
  },
  en: {
    buy_hold: 'Buy & Hold',
    sma_cross: 'SMA Crossover',
    rsi_reversal: 'RSI Reversal',
    donchian: 'Donchian Breakout',
  },
}

const STRATEGY_DESCRIPTIONS: Record<string, string> = {
  buy_hold: 'Buy on the first tradable day and hold through the end of the period.',
  sma_cross: 'Buy when the short moving average crosses above the long moving average, and sell on cross below.',
  rsi_reversal: 'Buy when RSI crosses above the oversold threshold, and sell when it crosses above the overbought threshold.',
  donchian: 'Buy when close breaks above the prior channel high, and sell when it breaks below the prior channel low.',
}

const PARAMETER_LABELS: Record<string, string> = {
  short_window: 'Short SMA Window',
  long_window: 'Long SMA Window',
  period: 'RSI Period',
  oversold: 'Oversold Threshold',
  overbought: 'Overbought Threshold',
  entry_window: 'Entry Channel Window',
  exit_window: 'Exit Channel Window',
}

const PARAMETER_DESCRIPTIONS: Record<string, string> = {
  short_window: 'Trading days used for the short simple moving average.',
  long_window: 'Trading days used for the long simple moving average.',
  period: 'Trading days used to calculate the Relative Strength Index.',
  oversold: 'Generates a buy signal when RSI crosses above this level.',
  overbought: 'Generates a sell signal when RSI crosses above this level.',
  entry_window: 'Trading days used for the entry price channel.',
  exit_window: 'Trading days used for the exit price channel.',
}

const INDICATOR_LABELS: Record<Locale, Record<string, string>> = {
  zh: {
    short_sma: '短期均线',
    long_sma: '长期均线',
    rsi: 'RSI',
    entry_high: '入场通道上轨',
    exit_low: '退出通道下轨',
  },
  en: {
    short_sma: 'Short SMA',
    long_sma: 'Long SMA',
    rsi: 'RSI',
    entry_high: 'Entry High',
    exit_low: 'Exit Low',
  },
}

const REBALANCE_LABELS: Record<Locale, Record<RebalanceFrequency, string>> = {
  zh: {
    none: '不再平衡',
    monthly: '每月再平衡',
    quarterly: '每季度再平衡',
    yearly: '每年再平衡',
    threshold: '偏离阈值再平衡',
  },
  en: {
    none: 'No Rebalance',
    monthly: 'Monthly Rebalance',
    quarterly: 'Quarterly Rebalance',
    yearly: 'Yearly Rebalance',
    threshold: 'Threshold Rebalance',
  },
}

export function strategyLabel(key: string, locale: Locale = 'zh'): string {
  return STRATEGY_LABELS[locale][key] ?? key
}

export function strategyDescription(key: string, fallback: string, locale: Locale = 'zh'): string {
  return locale === 'en' ? (STRATEGY_DESCRIPTIONS[key] ?? fallback) : fallback
}

export function strategyParameterLabel(key: string, fallback: string, locale: Locale = 'zh'): string {
  return locale === 'en' ? (PARAMETER_LABELS[key] ?? fallback) : fallback
}

export function strategyParameterDescription(key: string, fallback: string, locale: Locale = 'zh'): string {
  return locale === 'en' ? (PARAMETER_DESCRIPTIONS[key] ?? fallback) : fallback
}

export function indicatorLabel(key: string, locale: Locale = 'zh'): string {
  return INDICATOR_LABELS[locale][key] ?? key
}

export function rebalanceLabel(frequency: RebalanceFrequency, locale: Locale = 'zh'): string {
  return REBALANCE_LABELS[locale][frequency]
}
