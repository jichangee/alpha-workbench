# First-Day Entry and Rotation Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Buy the primary stock on the first session and optionally rotate into one fixed alternate stock whenever the primary strategy is out of market.

**Architecture:** Initialize strategy state as invested and generalize the execution engine from long/flat to a single active position that may be primary, alternate, or cash. The frontend loads one or two datasets, keeps their IDs in the existing cached workflow, and exposes the mode through a small controlled execution-mode component.

**Tech Stack:** Python 3.11+, pandas, FastAPI, Pydantic, React 19, TypeScript, Vitest, pytest

## Global Constraints

- The strategy and benchmark buy the primary stock at the first common session open.
- Later signals continue to execute at the following common session open.
- Rotation performs sell then buy on the same open and charges both commissions plus directional slippage.
- Rotation uses only the intersection of both datasets' trading dates.
- The alternate stock is a fixed Yahoo Finance symbol and must differ from a known primary symbol.
- Existing cash mode, CSV support, 400 millisecond automatic backtests, request cancellation, and Chinese error messages remain supported.

---

### Task 1: Invested Strategy Initialization

**Files:**
- Modify: `backend/app/strategies.py`
- Test: `backend/tests/test_strategies.py`

**Interfaces:**
- Consumes: existing `_target_from_events(index, buy, sell)` strategy helper.
- Produces: every long/flat strategy target starts at `1` and changes only on a real buy or sell event.

- [ ] **Step 1: Add failing tests**

Assert that SMA, RSI, and Donchian targets remain `1` during warmup and until the first real sell event. Keep existing signal-crossing assertions for later state transitions.

- [ ] **Step 2: Verify red**

Run: `cd backend && pytest tests/test_strategies.py -q`

Expected: the new initial-state assertions fail with target `0`.

- [ ] **Step 3: Implement invested initialization**

Initialize `_target_from_events` with `position = 1` and initialize its output series to `1`, while retaining sell-before-buy event processing and all validation.

- [ ] **Step 4: Verify green**

Run: `cd backend && pytest tests/test_strategies.py -q`

Expected: all strategy tests pass.

### Task 2: First-Day and Dual-Asset Execution Engine

**Files:**
- Modify: `backend/app/engine.py`
- Test: `backend/tests/test_engine.py`

**Interfaces:**
- Consumes: primary bars, target, costs, optional aligned alternate bars, and primary/alternate symbols.
- Produces: `run_engine(..., primary_symbol: str, alternate_bars: pd.DataFrame | None = None, alternate_symbol: str | None = None)` with symbol-aware fills, trades, and `position_symbol` equity.

- [ ] **Step 1: Add failing first-day execution tests**

Assert the first strategy and benchmark purchases occur on `bars.index[0]` at its open, and that a target transition visible at close `N` executes at open `N+1`.

- [ ] **Step 2: Add failing rotation reconciliation test**

Use three aligned sessions where target `[1, 0, 0]`. Assert first-day primary purchase, second-day no change, and third-day primary sale followed by alternate purchase. Assert fill symbols and sides are `[(SPY,buy), (SPY,sell), (QQQ,buy)]`, both switch commissions are charged, and final holdings use alternate close.

- [ ] **Step 3: Verify red**

Run: `cd backend && pytest tests/test_engine.py -q`

Expected: failures show first purchase on day two and unsupported alternate arguments.

- [ ] **Step 4: Generalize the engine**

Add `symbol` to `Fill` and `Trade`. Track `current_symbol`, `shares`, and the open trade. On each session choose primary for initial entry, then primary for target `1`, alternate for target `0` in rotation mode, or cash otherwise. Sell the current asset before buying the desired asset. Value the current asset with its own close and keep numeric finite checks separate from `position_symbol`.

- [ ] **Step 5: Verify green**

Run: `cd backend && pytest tests/test_engine.py -q`

Expected: all engine tests pass.

### Task 3: API, Alignment, and Serialization

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/datasets.py`
- Modify: `backend/app/backtests.py`
- Modify: `backend/app/serialization.py`
- Test: `backend/tests/test_backtest_api.py`
- Test: `backend/tests/test_serialization.py`

**Interfaces:**
- Consumes: `positionMode: Literal['cash','rotate']` and optional `alternateDatasetId` in `BacktestRequest`.
- Produces: metadata symbols/mode, symbol-aware fills/trades, and `positionSymbol` series.

- [ ] **Step 1: Add failing request and alignment tests**

Assert rotation without `alternateDatasetId` returns 422, an unknown alternate ID returns 404, same-symbol datasets return 422, no common dates returns 400, and partially overlapping datasets return only their common dates.

- [ ] **Step 2: Add failing response tests**

Assert metadata contains `positionMode`, `primarySymbol`, and `alternateSymbol`; each fill/trade contains `symbol`; series contains `positionSymbol`; execution is `first_open_then_next_open`.

- [ ] **Step 3: Verify red**

Run: `cd backend && pytest tests/test_backtest_api.py tests/test_serialization.py -q`

Expected: new request fields and response fields are absent.

- [ ] **Step 4: Implement schemas and dataset metadata access**

Add the request/response fields and a `DatasetStore.get_metadata(dataset_id)` method that returns a deep copy. Use a Pydantic model validator to require the alternate ID only in rotate mode.

- [ ] **Step 5: Implement aligned backtests and serialization**

Resolve both datasets, validate symbols, intersect indexes, compute signals on aligned primary bars, and call the generalized engine with authoritative metadata symbols. Serialize the new fields without exposing pandas or NumPy values.

- [ ] **Step 6: Verify green**

Run: `cd backend && pytest tests/test_backtest_api.py tests/test_serialization.py -q`

Expected: all focused API and serialization tests pass.

### Task 4: Frontend Rotation Loading and Controls

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/api.test.ts`
- Create: `frontend/src/components/PositionModeControls.tsx`
- Create: `frontend/src/components/PositionModeControls.test.tsx`
- Modify: `frontend/src/components/BacktestForm.tsx`
- Modify: `frontend/src/components/BacktestForm.test.tsx`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes: `positionMode`, `alternateSymbol`, primary preview dates, and optional alternate dataset ID.
- Produces: accessible cash/rotation buttons and one/two-dataset cached backtest requests.

- [ ] **Step 1: Add failing control tests**

Assert cash and rotation render as `aria-pressed` buttons, the alternate input appears only in rotation mode, and its value is uppercased.

- [ ] **Step 2: Add failing API/form tests**

Assert rotation sends `positionMode` plus `alternateDatasetId`; initial rotation load previews primary then alternate Yahoo data using primary preview dates; automatic slider changes reuse both IDs without preview calls; mode/symbol changes invalidate the ready state; empty or same symbol shows Chinese validation.

- [ ] **Step 3: Verify red**

Run: `cd frontend && npm test -- --run src/api.test.ts src/components/PositionModeControls.test.tsx src/components/BacktestForm.test.tsx`

Expected: tests fail because the mode and alternate dataset do not exist.

- [ ] **Step 4: Implement types, API, and controls**

Extend `FormState`, wire types, and `toBacktestRequest`. Implement the controlled button/input component and matching selected/focus/mobile styles using existing visual tokens.

- [ ] **Step 5: Implement two-stage loading**

Include mode/symbol in the market fingerprint. In rotate mode preview the primary, preview an alternate Yahoo input over the primary preview dates, retain both IDs, and pass both to explicit and automatic backtests. Preserve abort behavior across both previews.

- [ ] **Step 6: Verify green**

Run: `cd frontend && npm test -- --run src/api.test.ts src/components/PositionModeControls.test.tsx src/components/BacktestForm.test.tsx`

Expected: all focused frontend workflow tests pass.

### Task 5: Result Labels, Documentation, and Full Verification

**Files:**
- Modify: `frontend/src/components/ResultsDashboard.tsx`
- Modify: `frontend/src/components/TradesTable.tsx`
- Modify: `frontend/src/components/PriceChart.tsx`
- Modify: `frontend/src/components/ResultsDashboard.test.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: optional frontend response symbol/mode fields for backward-compatible fixtures.
- Produces: symbol-aware titles/table rows and primary-only price markers.

- [ ] **Step 1: Add failing result tests**

Assert a rotation result shows `SPY ↔ QQQ`, execution copy “首日开盘建仓 · 后续次日开盘调仓”, and a “标的” table column. Assert `buildPriceOption` excludes QQQ fills from the primary candlestick mark points.

- [ ] **Step 2: Verify red**

Run: `cd frontend && npm test -- --run src/components/ResultsDashboard.test.tsx src/components/PriceChart.test.ts`

Expected: symbol labels and filtering are absent.

- [ ] **Step 3: Implement result presentation and docs**

Render the symbol pair in the heading, add the trade symbol column, filter primary chart markers, update the header badge, and document both modes plus first-day execution.

- [ ] **Step 4: Run complete verification**

Run: `PATH="$PWD/.venv/bin:$PATH" npm run test`

Expected: launcher, backend, and frontend suites pass with zero failures.

Run: `PATH="$PWD/.venv/bin:$PATH" npm run build`

Expected: TypeScript and Vite production build pass.

Run: `git diff --check`

Expected: no output.
