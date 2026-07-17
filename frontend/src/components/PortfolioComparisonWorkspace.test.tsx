import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api'
import { comparisonResultFixture } from '../portfolioComparisonFixture'
import { PortfolioComparisonWorkspace, portfolioComparisonErrorMessage } from './PortfolioComparisonWorkspace'

const comparePortfoliosMock = vi.hoisted(() => vi.fn())

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return { ...actual, comparePortfolios: comparePortfoliosMock }
})

vi.mock('echarts/core', () => ({
  init: () => ({ dispose: vi.fn(), resize: vi.fn(), setOption: vi.fn() }),
  use: vi.fn(),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => { resolve = complete })
  return { promise, resolve }
}

describe('PortfolioComparisonWorkspace', () => {
  beforeEach(() => comparePortfoliosMock.mockReset())

  it('starts with an explanatory empty result', () => {
    render(<PortfolioComparisonWorkspace />)

    expect(screen.getByText('等待持仓')).toBeVisible()
    expect(screen.getByText(/设置两组持仓并开始对比/)).toBeVisible()
  })

  it('shows progress and then the returned comparison', async () => {
    const user = userEvent.setup()
    const pending = deferred<typeof comparisonResultFixture>()
    comparePortfoliosMock.mockReturnValue(pending.promise)
    render(<PortfolioComparisonWorkspace />)

    await user.click(screen.getByRole('button', { name: '开始对比' }))
    expect(screen.getByText('正在对齐行情并计算两组持仓…')).toBeVisible()

    await act(async () => pending.resolve(comparisonResultFixture))
    expect(await screen.findByRole('region', { name: '持仓对比结果' })).toBeVisible()
  })

  it('aborts a pending request before starting a newer comparison', async () => {
    const user = userEvent.setup()
    const first = deferred<typeof comparisonResultFixture>()
    const second = deferred<typeof comparisonResultFixture>()
    comparePortfoliosMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    render(<PortfolioComparisonWorkspace />)

    await user.click(screen.getByRole('button', { name: '开始对比' }))
    const firstSignal = comparePortfoliosMock.mock.calls[0][1] as AbortSignal
    await user.click(screen.getByRole('button', { name: '重新对比' }))

    expect(firstSignal.aborted).toBe(true)
    expect(comparePortfoliosMock).toHaveBeenCalledTimes(2)
    await act(async () => second.resolve(comparisonResultFixture))
    expect(await screen.findByRole('region', { name: '持仓对比结果' })).toBeVisible()
  })

  it('preserves a readable API error message', () => {
    const failure = new ApiError({ code: 'MARKET_DATA_ERROR', message: 'SOXX 行情不可用', fields: {} })

    expect(portfolioComparisonErrorMessage(failure)).toBe('SOXX 行情不可用')
    expect(portfolioComparisonErrorMessage(new Error('offline'))).toBe('网络连接失败，请检查服务后重试。')
  })

  it('ignores a stale response after it has been aborted', async () => {
    const user = userEvent.setup()
    const first = deferred<typeof comparisonResultFixture>()
    const second = deferred<typeof comparisonResultFixture>()
    comparePortfoliosMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    render(<PortfolioComparisonWorkspace />)
    await user.click(screen.getByRole('button', { name: '开始对比' }))
    await user.click(screen.getByRole('button', { name: '重新对比' }))

    const stale = {
      ...comparisonResultFixture,
      portfolios: [
        { ...comparisonResultFixture.portfolios[0], name: '过期结果' },
        comparisonResultFixture.portfolios[1],
      ],
    } as typeof comparisonResultFixture
    await act(async () => first.resolve(stale))
    expect(screen.queryByText('过期结果')).not.toBeInTheDocument()
    await act(async () => second.resolve(comparisonResultFixture))
    await waitFor(() => expect(screen.getByRole('region', { name: '持仓对比结果' })).toBeVisible())
  })
})
