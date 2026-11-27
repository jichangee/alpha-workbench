import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(resolve(process.cwd(), 'src', path), 'utf8')
const styles = source('styles.css')
const lightSurfaceComponents = [
  'components/MetricCards.tsx',
  'components/TradesTable.tsx',
  'components/ResultsDashboard.tsx',
].map(source).join('\n')

describe('fixed light theme contract', () => {
  it('uses light root tokens without a dark-theme override', () => {
    expect(styles).toMatch(/:root\s*\{[\s\S]*?color-scheme:\s*light;/)
    expect(styles).not.toMatch(/:root\s*,\s*\.dark/)
    expect(styles).toContain('fill: #52525b !important;')
  })

  it('uses readable semantic text tones on light cards', () => {
    expect(lightSurfaceComponents).not.toMatch(/text-(?:emerald|red)-400|text-amber-200/)
    expect(lightSurfaceComponents).toContain('text-emerald-700')
    expect(lightSurfaceComponents).toContain('text-red-700')
    expect(lightSurfaceComponents).toContain('text-amber-700')
  })
})
