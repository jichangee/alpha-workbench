# Portfolio Rebalance Chart Markers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mark every portfolio's actual rebalance dates on its normalized-equity line and default both forms' end date to local today.

**Architecture:** Keep the existing API response and attach ECharts `markPoint` data directly to each portfolio's line series. Map each `rebalanceDate` through the shared date axis to the same portfolio's equity value, while retaining the existing local-date string helpers for form defaults.

**Tech Stack:** React 19, TypeScript, Vite, Apache ECharts 6, Vitest, Testing Library

## Global Constraints

- Modify frontend files only.
- Use each portfolio's existing `rebalanceDates`; do not infer new rebalance events.
- Ignore dates not present in `result.dates` and non-finite equity values.
- Keep markers label-free until hover and color-match them to their portfolio line.
- Keep the existing start-date rule and change only the initial end date to local today.
- Preserve API shapes, validation, market invalidation, and user-selected dates.
- Preserve all unrelated uncommitted work in the current workspace.

---

### Task 1: Default both form end dates to local today

**Files:**
- Modify: `frontend/src/components/BacktestForm.test.tsx`
- Modify: `frontend/src/components/BacktestForm.tsx`
- Modify: `frontend/src/components/PortfolioComparisonForm.test.tsx`
- Modify: `frontend/src/components/PortfolioComparisonForm.tsx`

**Interfaces:**
- Consumes: the existing local `localDate(Date): string` helpers.
- Produces: initial ranges of `currentYear - 5-01-01` through today's local `YYYY-MM-DD`.

- [x] **Step 1: Change default-date expectations**

For a fake local time of `2026-07-17 12:00`, assert both forms display:

```tsx
expect(startTrigger).toHaveTextContent('2021-01-01')
expect(endTrigger).toHaveTextContent('2026-07-17')
```

Use midday fake time so the assertion verifies local formatting without crossing a date boundary.

- [x] **Step 2: Run focused tests and verify RED**

Run:

```bash
cd frontend
npm test -- --run src/components/BacktestForm.test.tsx src/components/PortfolioComparisonForm.test.tsx
```

Expected: exactly the two default end-date assertions fail with the previous year-end values.

- [x] **Step 3: Change initial end dates**

In `BacktestForm.initialForm`, replace:

```ts
end: localDate(new Date(lastCompleteYear, 11, 31))
```

with:

```ts
end: localDate(now)
```

In `PortfolioComparisonForm.initialDates`, make the same change while retaining the existing start-year calculation.

- [x] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
cd frontend
npm test -- --run src/components/BacktestForm.test.tsx src/components/PortfolioComparisonForm.test.tsx
```

Expected: all focused form tests pass.

### Task 2: Add per-series rebalance mark points

**Files:**
- Modify: `frontend/src/components/PortfolioComparisonChart.tsx`
- Modify: `frontend/src/components/PortfolioComparisonResults.test.tsx`

**Interfaces:**
- Consumes: `PortfolioComparisonResponse.dates`, each portfolio's `equity`, `rebalanceDates`, and the existing `portfolioColors`.
- Produces: each line series has `markPoint.data` items shaped as `{ name, value, coord }`.

- [x] **Step 1: Write failing chart-option assertions**

Render a result with:

```ts
dates: ['2021-01-04', '2021-01-29', '2021-02-26']
portfolios: [
  {
    name: '持仓 1',
    rebalanceDates: ['2021-01-29', '2021-02-26', '2099-01-01'],
    equity: [100, 102.25, 104.5],
  },
  {
    name: '持仓 2',
    rebalanceDates: [],
    equity: [100, 101, 103],
  },
]
```

Assert the first series has exactly:

```ts
[
  { name: '再平衡', value: 102.25, coord: ['2021-01-29', 102.25] },
  { name: '再平衡', value: 104.5, coord: ['2021-02-26', 104.5] },
]
```

Assert the unknown date is absent, the second series has an empty marker list, marker labels are hidden, and the marker tooltip formatter returns `持仓 1<br/>再平衡 · 2021-01-29<br/>净值 102.25`.

- [x] **Step 2: Run the chart test and verify RED**

Run:

```bash
cd frontend
npm test -- --run src/components/PortfolioComparisonResults.test.tsx
```

Expected: FAIL because the line series do not contain `markPoint`.

- [x] **Step 3: Register and configure MarkPoint**

Import `MarkPointComponent` from `echarts/components` and include it in the existing `use([...])` registration.

For each portfolio, create a date-to-index map once for the shared dates and map valid rebalance dates to:

```ts
{
  name: '再平衡',
  value: equity,
  coord: [date, equity],
}
```

Configure the series `markPoint` with:

```ts
{
  symbol: 'circle',
  symbolSize: 8,
  label: { show: false },
  itemStyle: {
    color: portfolioColors[index % portfolioColors.length],
    borderColor: '#ffffff',
    borderWidth: 1.5,
  },
  tooltip: {
    formatter: ({ data }) =>
      `${portfolio.name}<br/>再平衡 · ${data.coord[0]}<br/>净值 ${Number(data.value).toFixed(2)}`,
  },
  data: rebalancePoints,
}
```

- [x] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
cd frontend
npm test -- --run src/components/PortfolioComparisonResults.test.tsx
```

Expected: all result and chart assertions pass.

- [x] **Step 5: Run full frontend verification**

Run:

```bash
cd frontend
npm test -- --run
npm run build
```

Expected: the complete frontend test suite passes and the TypeScript/Vite production build completes successfully.
