import { describe, expect, it } from 'vitest'
import { formatCurrency, formatInteger, formatNumber, formatPercent, formatSignedCurrency } from './formatters'

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

  it('formats signed P&L currency values explicitly', () => {
    expect(formatSignedCurrency(12.34)).toBe('+$12.34')
    expect(formatSignedCurrency(-12.34)).toBe('-$12.34')
    expect(formatSignedCurrency(0)).toBe('$0.00')
    expect(formatSignedCurrency(null)).toBe('—')
  })

  it('formats integer metrics without decimal places', () => {
    expect(formatInteger(1234)).toBe('1,234')
    expect(formatInteger(null)).toBe('—')
  })
})
