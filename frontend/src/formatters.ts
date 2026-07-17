const missingValue = '—'

export function formatCurrency(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return missingValue
  const absolute = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${value < 0 ? '-' : ''}$${absolute}`
}

export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return missingValue
  const sign = value > 0 ? '+' : value < 0 ? '-' : ''
  return `${sign}${Math.abs(value * 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

export function formatNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return missingValue
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
