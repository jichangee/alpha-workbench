import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DatePicker } from './DatePicker'

describe('DatePicker', () => {
  it('shows the controlled value and emits a locally formatted selected date', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <DatePicker
        id="start-date"
        aria-label="开始日期"
        value="2021-01-01"
        min="2021-01-01"
        max="2021-01-31"
        onChange={onChange}
      />,
    )

    const trigger = screen.getByRole('button', { name: '开始日期' })
    expect(trigger).toHaveTextContent('2021-01-01')

    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: /2021年1月15日/ }))

    expect(onChange).toHaveBeenCalledWith('2021-01-15')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('disables dates outside the configured bounds', async () => {
    const user = userEvent.setup()

    render(
      <DatePicker
        id="end-date"
        aria-label="结束日期"
        value="2021-01-15"
        min="2021-01-10"
        max="2021-01-20"
        onChange={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '结束日期' }))

    expect(screen.getByRole('button', { name: /2021年1月9日/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /2021年1月21日/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /2021年1月20日/ })).toBeEnabled()
  })

  it('allows navigating directly to a year from the calendar caption', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <DatePicker
        id="historical-date"
        aria-label="历史日期"
        value="2021-01-15"
        min="2015-01-01"
        max="2026-12-31"
        onChange={onChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: '历史日期' }))
    await user.selectOptions(
      screen.getByRole('combobox', { name: '选择年份' }),
      '2018',
    )
    await user.click(screen.getByRole('button', { name: /2018年1月15日/ }))

    expect(onChange).toHaveBeenCalledWith('2018-01-15')
  })
})
