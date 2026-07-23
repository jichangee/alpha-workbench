# Fixed Light Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the forced dark dashboard palette with one fixed, accessible light theme.

**Architecture:** Keep theme ownership in `frontend/src/styles.css` and preserve the existing shadcn/ui component structure. Replace only global color tokens, chart-label color, and the few hard-coded performance/warning text classes that would be too light on white surfaces.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Tailwind CSS 4, shadcn/ui, ECharts.

## Global Constraints

- Use a light zinc page background with white cards and popovers.
- Keep emerald as the primary product accent.
- Keep Geist Sans and Geist Mono.
- Do not add a theme toggle, system-theme detection, persistence, or an inactive dark theme.
- Do not change layouts, APIs, calculations, or request behavior.
- Preserve all existing user-owned uncommitted changes.
- Do not stage or commit implementation files without separate user approval.

---

### Task 1: Fixed Light Theme Contract and Tokens

**Files:**
- Create: `frontend/src/theme.test.ts`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/src/components/MetricCards.tsx`
- Modify: `frontend/src/components/TradesTable.tsx`
- Modify: `frontend/src/components/ResultsDashboard.tsx`

**Interfaces:**
- Consumes: existing shadcn/ui CSS variable names and Tailwind color utilities
- Produces: one unconditional light-theme token set and light-surface-readable chart/performance colors

- [ ] **Step 1: Write the failing theme contract test**

Create `frontend/src/theme.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')
const lightSurfaceComponents = [
  './components/MetricCards.tsx',
  './components/TradesTable.tsx',
  './components/ResultsDashboard.tsx',
].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n')

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
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd frontend
npm test -- --run src/theme.test.ts
```

Expected: both tests fail because the stylesheet forces `color-scheme: dark`, chart labels use `#a1a1aa`, and light-surface components use `*-400`/`amber-200` text colors.

- [ ] **Step 3: Replace the forced-dark token block**

In `frontend/src/styles.css`, replace `:root, .dark` with a single `:root` block using:

```css
:root {
  color-scheme: light;
  font-synthesis: none;
  --radius: 0.625rem;
  --background: oklch(0.985 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.508 0.118 165.612);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.508 0.118 165.612);
  --chart-1: oklch(0.508 0.118 165.612);
  --chart-2: oklch(0.646 0.154 55);
  --chart-3: oklch(0.55 0.13 250);
  --chart-4: oklch(0.55 0.14 320);
  --chart-5: oklch(0.62 0.13 90);
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.508 0.118 165.612);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.508 0.118 165.612);
}
```

Change the chart label override to:

```css
.chart-canvas svg text,
.portfolio-chart-canvas svg text {
  fill: #52525b !important;
}
```

- [ ] **Step 4: Strengthen hard-coded text colors for light surfaces**

Make these exact replacements:

```text
text-emerald-400 -> text-emerald-700
text-red-400 -> text-red-700
text-amber-200 -> text-amber-700
```

Apply them only in:

- `frontend/src/components/MetricCards.tsx`
- `frontend/src/components/TradesTable.tsx`
- `frontend/src/components/ResultsDashboard.tsx`

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
cd frontend
npm test -- --run src/theme.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 6: Run automated verification**

Run from the repository root:

```bash
PATH="$PWD/.venv/bin:$PATH" npm run test
npm run build
git diff --check
```

Expected: launcher, backend, and frontend tests pass; the Vite production build succeeds; diff check has no output.

- [ ] **Step 7: Run browser verification**

Start the local application:

```bash
PATH="$PWD/.venv/bin:$PATH" npm run dev
```

Verify both workspaces at desktop width and 390 px width:

- Root computed `color-scheme` is `light`.
- Page background is light and cards/popovers are white.
- Strategy and portfolio tabs switch correctly.
- Rebalance selectors and form controls remain readable.
- Positive, negative, warning, chart, and muted text have sufficient visual contrast.
- No Vite error overlay, console error, or horizontal overflow appears.

Stop the temporary server after verification.

- [ ] **Step 8: Preserve implementation changes unstaged**

Run:

```bash
git status --short
```

Expected: the theme implementation remains visible alongside the existing user-owned working-tree changes. Do not stage or commit implementation files.
