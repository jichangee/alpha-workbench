import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { PositionMode } from '../types'
import { PositionModeControls } from './PositionModeControls'

function Harness() {
  const [mode, setMode] = useState<PositionMode>('cash')
  const [alternateSymbol, setAlternateSymbol] = useState('')
  return (
    <PositionModeControls
      mode={mode}
      alternateSymbol={alternateSymbol}
      onModeChange={setMode}
      onAlternateSymbolChange={setAlternateSymbol}
    />
  )
}

describe('PositionModeControls', () => {
  it('reveals an uppercase alternate symbol only in rotation mode', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    expect(screen.getByRole('radio', { name: '卖出后持有现金' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByLabelText('替代股票代码')).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: '卖出后换仓' }))
    await user.type(screen.getByLabelText('替代股票代码'), 'qqq')

    expect(screen.getByRole('radio', { name: '卖出后换仓' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByLabelText('替代股票代码')).toHaveValue('QQQ')
  })
})
