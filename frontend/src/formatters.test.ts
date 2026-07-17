import { describe, expect, it } from 'vitest'
import { formatCurrency, formatNumber, formatPercent } from './formatters'

describe('result formatters', () => {
  it('formats USD values with two decimal places', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50')
  })

  it('formats signed percentages and missing values', () => {
    expect(formatPercent(-0.1234)).toBe('-12.34%')
    expect(formatPercent(null)).toBe('—')
  })

  it('formats whole number metrics and missing values', () => {
    expect(formatNumber(1234.5)).toBe('1,234.50')
    expect(formatNumber(null)).toBe('—')
  })
})
