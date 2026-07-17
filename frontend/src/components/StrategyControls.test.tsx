import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { StrategyDefinition } from '../types'
import { StrategyControls } from './StrategyControls'

const strategies: readonly StrategyDefinition[] = [
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
]

function Harness({ initialParams = { short_window: 20, long_window: 50 } }) {
  const [strategyKey, setStrategyKey] = useState('buy_hold')
  const [params, setParams] = useState<Record<string, number>>({})
  return (
    <StrategyControls
      strategies={strategies}
      strategyKey={strategyKey}
      params={params}
      onStrategyChange={(nextKey) => {
        setStrategyKey(nextKey)
        setParams(nextKey === 'sma_cross' ? initialParams : {})
      }}
      onParamsChange={setParams}
    />
  )
}

describe('StrategyControls', () => {
  it('renders strategies as pressed-state buttons and reveals the selected sliders', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    expect(screen.getByRole('button', { name: '买入并持有' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: '均线交叉' }))

    expect(screen.getByRole('button', { name: '均线交叉' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('短均线周期滑块')).toBeVisible()
    expect(screen.getByLabelText('长均线周期滑块')).toBeVisible()
  })

  it('pushes the long window up when the short window reaches it', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: '均线交叉' }))

    fireEvent.change(screen.getByLabelText('短均线周期滑块'), { target: { value: '50' } })

    expect(screen.getByLabelText('短均线周期数值')).toHaveValue(50)
    expect(screen.getByLabelText('长均线周期数值')).toHaveValue(51)
  })

  it('pulls the short window down when the long window reaches it', async () => {
    const user = userEvent.setup()
    render(<Harness initialParams={{ short_window: 20, long_window: 50 }} />)
    await user.click(screen.getByRole('button', { name: '均线交叉' }))

    fireEvent.change(screen.getByLabelText('长均线周期滑块'), { target: { value: '20' } })

    expect(screen.getByLabelText('短均线周期数值')).toHaveValue(19)
    expect(screen.getByLabelText('长均线周期数值')).toHaveValue(20)
  })
})
