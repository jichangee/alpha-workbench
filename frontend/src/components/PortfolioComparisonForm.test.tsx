import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PortfolioComparisonForm } from './PortfolioComparisonForm'


describe('PortfolioComparisonForm', () => {
  afterEach(() => vi.useRealTimers())

  it('starts with the recommended portfolios and five complete calendar years', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 17, 12))

    render(<PortfolioComparisonForm onCompare={vi.fn()} running={false} />)

    expect(screen.getByLabelText('持仓 1 第 1 只股票代码')).toHaveValue('VOO')
    expect(screen.getByLabelText('持仓 1 第 1 只股票权重')).toHaveValue(50)
    expect(screen.getByLabelText('持仓 1 第 2 只股票代码')).toHaveValue('QQQ')
    expect(screen.getByLabelText('持仓 1 第 2 只股票权重')).toHaveValue(50)
    expect(screen.getByLabelText('持仓 2 第 1 只股票代码')).toHaveValue('SOXX')
    expect(screen.getByLabelText('持仓 2 第 1 只股票权重')).toHaveValue(100)
    expect(screen.getAllByText('合计 100%')).toHaveLength(2)
    expect(screen.getByLabelText('对比开始日期')).toHaveValue('2021-01-01')
    expect(screen.getByLabelText('对比结束日期')).toHaveValue('2025-12-31')
  })

  it('adds and removes stock rows while keeping at least one row', async () => {
    const user = userEvent.setup()
    render(<PortfolioComparisonForm onCompare={vi.fn()} running={false} />)

    await user.click(screen.getByRole('button', { name: '为持仓 2 添加股票' }))
    expect(screen.getByLabelText('持仓 2 第 2 只股票代码')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '删除持仓 2 第 2 只股票' }))
    expect(screen.queryByLabelText('持仓 2 第 2 只股票代码')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '删除持仓 2 第 1 只股票' })).toBeDisabled()
  })

  it('blocks comparison until each portfolio totals 100%', async () => {
    const user = userEvent.setup()
    const onCompare = vi.fn()
    render(<PortfolioComparisonForm onCompare={onCompare} running={false} />)

    await user.clear(screen.getByLabelText('持仓 1 第 1 只股票权重'))
    await user.type(screen.getByLabelText('持仓 1 第 1 只股票权重'), '40')
    await user.click(screen.getByRole('button', { name: '开始对比' }))

    expect(onCompare).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('每组持仓权重合计必须为 100%。')
    expect(screen.getByText('合计 90%')).toHaveClass('invalid')
  })

  it('normalizes symbols and converts percentages to decimal weights', async () => {
    const user = userEvent.setup()
    const onCompare = vi.fn()
    render(<PortfolioComparisonForm onCompare={onCompare} running={false} />)

    const symbol = screen.getByLabelText('持仓 1 第 1 只股票代码')
    await user.clear(symbol)
    await user.type(symbol, ' voo ')
    await user.click(screen.getByRole('button', { name: '开始对比' }))

    expect(onCompare).toHaveBeenCalledWith(expect.objectContaining({
      portfolios: [
        { name: '持仓 1', positions: [{ symbol: 'VOO', weight: 0.5 }, { symbol: 'QQQ', weight: 0.5 }] },
        { name: '持仓 2', positions: [{ symbol: 'SOXX', weight: 1 }] },
      ],
    }))
  })

  it('rejects duplicate symbols in one portfolio', async () => {
    const user = userEvent.setup()
    const onCompare = vi.fn()
    render(<PortfolioComparisonForm onCompare={onCompare} running={false} />)

    const symbol = screen.getByLabelText('持仓 1 第 2 只股票代码')
    await user.clear(symbol)
    await user.type(symbol, 'voo')
    await user.click(screen.getByRole('button', { name: '开始对比' }))

    expect(onCompare).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('同一持仓不能重复添加股票。')
  })

  it('adds a third 100% portfolio and submits every portfolio', async () => {
    const user = userEvent.setup()
    const onCompare = vi.fn()
    render(<PortfolioComparisonForm onCompare={onCompare} running={false} />)

    await user.click(screen.getByRole('button', { name: '新增持仓' }))

    expect(screen.getByRole('heading', { name: '编辑 3 组持仓' })).toBeVisible()
    expect(screen.getByLabelText('持仓 3 名称')).toHaveValue('持仓 3')
    expect(screen.getByLabelText('持仓 3 第 1 只股票权重')).toHaveValue(100)
    await user.type(screen.getByLabelText('持仓 3 第 1 只股票代码'), 'aapl')
    await user.click(screen.getByRole('button', { name: '开始对比' }))

    expect(onCompare).toHaveBeenCalledTimes(1)
    expect(onCompare.mock.calls[0][0].portfolios).toHaveLength(3)
    expect(onCompare.mock.calls[0][0].portfolios[2]).toEqual({
      name: '持仓 3',
      positions: [{ symbol: 'AAPL', weight: 1 }],
    })
  })

  it('keeps at least two portfolios and preserves remaining data after deletion', async () => {
    const user = userEvent.setup()
    render(<PortfolioComparisonForm onCompare={vi.fn()} running={false} />)

    expect(screen.getByRole('button', { name: '删除持仓 1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '删除持仓 2' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '新增持仓' }))
    await user.type(screen.getByLabelText('持仓 3 第 1 只股票代码'), 'AAPL')
    await user.click(screen.getByRole('button', { name: '删除持仓 2' }))

    expect(screen.queryByDisplayValue('SOXX')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('AAPL')).toBeVisible()
    expect(screen.getByDisplayValue('持仓 3')).toBeVisible()
    expect(screen.getByRole('button', { name: '删除持仓 1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '删除持仓 3' })).toBeDisabled()
  })

  it('limits comparison to five portfolios', async () => {
    const user = userEvent.setup()
    render(<PortfolioComparisonForm onCompare={vi.fn()} running={false} />)

    await user.click(screen.getByRole('button', { name: '新增持仓' }))
    await user.click(screen.getByRole('button', { name: '新增持仓' }))
    await user.click(screen.getByRole('button', { name: '新增持仓' }))

    expect(screen.getByRole('heading', { name: '编辑 5 组持仓' })).toBeVisible()
    expect(screen.getByRole('button', { name: '新增持仓' })).toBeDisabled()
    expect(screen.getByText('最多 5 组')).toBeVisible()
  })
})
