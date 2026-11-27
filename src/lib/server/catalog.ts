import type { StrategyDefinition, StrategyParameter } from '@/types'

function integerParameter(
  key: string,
  name: string,
  description: string,
  defaultValue: number,
  minimum: number,
  maximum: number,
): StrategyParameter {
  return {
    key,
    name,
    description,
    type: 'integer',
    default: defaultValue,
    minimum,
    maximum,
  }
}

export const STRATEGIES: StrategyDefinition[] = [
  {
    key: 'buy_hold',
    name: '买入并持有',
    description: '在首个可成交日买入并长期持有。',
    parameters: [],
    validationRules: [],
  },
  {
    key: 'sma_cross',
    name: '均线交叉',
    description: '短期均线上穿长期均线时买入，下穿时卖出。',
    parameters: [
      integerParameter('short_window', '短均线周期', '用于计算短期简单移动平均线的交易日数。', 20, 2, 200),
      integerParameter('long_window', '长均线周期', '用于计算长期简单移动平均线的交易日数。', 50, 3, 400),
    ],
    validationRules: [
      {
        expression: 'short_window < long_window',
        message: '短均线周期必须小于长均线周期',
      },
    ],
  },
  {
    key: 'rsi_reversal',
    name: 'RSI 反转',
    description: 'RSI 上穿超卖阈值时买入，上穿超买阈值时卖出。',
    parameters: [
      integerParameter('period', 'RSI 周期', '用于计算相对强弱指数的交易日数。', 14, 2, 100),
      integerParameter('oversold', '超卖阈值', 'RSI 向上穿越此值时产生买入信号。', 30, 1, 49),
      integerParameter('overbought', '超买阈值', 'RSI 向上穿越此值时产生卖出信号。', 70, 51, 99),
    ],
    validationRules: [
      {
        expression: 'oversold < overbought',
        message: '超卖阈值必须小于超买阈值',
      },
    ],
  },
  {
    key: 'donchian',
    name: '唐奇安通道突破',
    description: '收盘价突破此前通道高点时买入，跌破低点时卖出。',
    parameters: [
      integerParameter('entry_window', '入场通道周期', '用于计算入场通道的交易日数。', 20, 2, 252),
      integerParameter('exit_window', '退出通道周期', '用于计算退出通道的交易日数。', 10, 2, 252),
    ],
    validationRules: [],
  },
]
