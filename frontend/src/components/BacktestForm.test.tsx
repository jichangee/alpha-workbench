import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BacktestForm } from './BacktestForm'

const catalogFixture = [
  {
    key: 'buy_hold',
    name: '买入并持有',
    description: '长期持有。',
    parameters: [],
    validationRules: [],
  },
  {
    key: 'sma_cross',
    name: '均线交叉',
    description: '短期均线上穿长期均线时买入。',
    parameters: [
      { key: 'short_window', name: '短均线周期', description: '短期交易日数。', type: 'integer', default: 20, minimum: 2, maximum: 200 },
      { key: 'long_window', name: '长均线周期', description: '长期交易日数。', type: 'integer', default: 50, minimum: 3, maximum: 400 },
    ],
    validationRules: [{ expression: 'short_window < long_window', message: '短均线周期必须小于长均线周期' }],
  },
  {
    key: 'rsi_reversal',
    name: 'RSI 反转',
    description: 'RSI 反转。',
    parameters: [{ key: 'period', name: 'RSI 周期', description: 'RSI 天数。', type: 'integer', default: 14, minimum: 2, maximum: 100 }],
    validationRules: [],
  },
] as const

describe('BacktestForm', () => {
  it('shows only the selected strategy parameters', async () => {
    const user = userEvent.setup()
    render(<BacktestForm strategies={catalogFixture} onRun={vi.fn()} />)

    await user.selectOptions(screen.getByLabelText('策略'), 'sma_cross')

    expect(screen.getByLabelText('短均线周期')).toBeVisible()
    expect(screen.getByLabelText('长均线周期')).toBeVisible()
    expect(screen.queryByLabelText('RSI 周期')).not.toBeInTheDocument()
  })

  it('blocks an invalid moving-average relationship with Chinese guidance', async () => {
    const user = userEvent.setup()
    render(<BacktestForm strategies={catalogFixture} onRun={vi.fn()} />)

    await user.selectOptions(screen.getByLabelText('策略'), 'sma_cross')
    await user.clear(screen.getByLabelText('短均线周期'))
    await user.type(screen.getByLabelText('短均线周期'), '50')
    await user.clear(screen.getByLabelText('长均线周期'))
    await user.type(screen.getByLabelText('长均线周期'), '20')
    await user.click(screen.getByRole('button', { name: '运行回测' }))

    expect(screen.getByText('短均线周期必须小于长均线周期')).toBeVisible()
  })

  it('switches to the CSV upload fields when the local source is selected', async () => {
    const user = userEvent.setup()
    render(<BacktestForm strategies={catalogFixture} onRun={vi.fn()} />)

    await user.selectOptions(screen.getByLabelText('数据来源'), 'csv')

    expect(screen.getByLabelText('CSV 文件')).toBeVisible()
    expect(screen.queryByLabelText('开始日期')).not.toBeInTheDocument()
  })
})
