# Task 7 report — Metrics, charts, and trade detail dashboard

## RED

Added formatter and dashboard-state tests before implementation, then ran:

```sh
cd frontend && npm test -- --run src/formatters.test.ts src/components/ResultsDashboard.test.tsx
```

The initial run failed as expected because `src/formatters.ts` and
`src/components/ResultsDashboard.tsx` did not exist.

## GREEN

Implemented the `ResultsDashboard` with typed metric cards, ECharts-backed
equity, price/indicator/fill, and drawdown views, responsive tabbed layout,
and accessible closed-trade detail/open-position state. `App` now stores and
renders the real `BacktestResponse` delivered by `BacktestForm`.

Fresh verification:

```sh
cd frontend && npm test -- --run
# 5 files passed, 13 tests passed

cd frontend && npm run build
# tsc --noEmit and vite build passed without warnings
```

The ECharts views initialize with the SVG renderer, resize through
`ResizeObserver` (with a window-resize fallback), and dispose their instances
and listeners on cleanup. Charts are lazily loaded by their dashboard tab.

## Review follow-up — RED

Added regression tests for mixed closed/open trades, explicit signed currency
and integer formatting, ordinary pressed chart buttons, chart option data,
and the `BacktestForm` to `App` result handoff. Before the fix, the focused
test run failed because the new formatter and chart option exports were
missing, the dashboard used tab roles, and open trades were omitted whenever
there was a closed trade.

## Review follow-up — GREEN

The trade table now renders every trade with a status column and preserves
open positions alongside closed trades. It shows gross P&L, costs, net P&L,
and return columns; open exit/P&L fields are em dashes. Positive gross and
net P&L use an explicit `+` sign, and trade count is an integer. Chart
controls are ordinary buttons using `aria-pressed`; price and drawdown option
builders have direct data-contract coverage.

Fresh verification after the follow-up:

```sh
cd frontend && npm test -- --run
# 7 files passed, 20 tests passed

cd frontend && npm run build
# tsc --noEmit and vite build passed without warnings
```
