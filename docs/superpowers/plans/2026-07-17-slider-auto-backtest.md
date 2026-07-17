# Slider Auto Backtest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace repetitive strategy confirmation with accessible strategy buttons, sliders, and debounced automatic backtests that reuse loaded market data.

**Architecture:** Split the frontend API into market-data loading and dataset backtesting operations. Keep the loaded `datasetId` in `BacktestForm`, invalidate it when market inputs change, and delegate strategy rendering plus paired-parameter correction to a focused controlled component.

**Tech Stack:** React 19, TypeScript, native range inputs, Vitest, Testing Library, CSS

## Global Constraints

- The first run explicitly loads market data; subsequent strategy or assumption changes debounce for 400 milliseconds and reuse the dataset.
- Any market source, symbol, date, or CSV file change invalidates the dataset.
- New requests cancel older requests, and stale responses never update the UI.
- Use no new runtime dependencies.
- Preserve Chinese user-facing copy and keyboard/touch accessibility.

---

### Task 1: Dataset Backtest API

**Files:**
- Modify: `frontend/src/api.ts`
- Test: `frontend/src/api.test.ts`

**Interfaces:**
- Consumes: existing `FormState`, `BacktestResponse`, and `toBacktestRequest`.
- Produces: `runBacktestForDataset(input: FormState, datasetId: string, signal?: AbortSignal): Promise<BacktestResponse>`.

- [ ] **Step 1: Write the failing API test**

Add a test that calls `runBacktestForDataset(yahooInput, 'dataset-42')` and asserts that the only fetch is `POST /api/backtests` with `toBacktestRequest(yahooInput, 'dataset-42')` as JSON.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `cd frontend && npm test -- --run src/api.test.ts`

Expected: FAIL because `runBacktestForDataset` is not exported.

- [ ] **Step 3: Implement the API boundary**

Implement the new function using the existing private `request` helper. Refactor `runBacktest` to call `previewMarketData` and then `runBacktestForDataset` so existing consumers remain compatible.

- [ ] **Step 4: Run the API tests**

Run: `cd frontend && npm test -- --run src/api.test.ts`

Expected: all API tests PASS.

### Task 2: Strategy Buttons, Sliders, and Relationship Correction

**Files:**
- Create: `frontend/src/components/StrategyControls.tsx`
- Create: `frontend/src/components/StrategyControls.test.tsx`

**Interfaces:**
- Consumes: `strategies: readonly StrategyDefinition[]`, `strategyKey: string`, and `params: Record<string, number>`.
- Produces: `onStrategyChange(strategyKey: string)` and `onParamsChange(params: Record<string, number>)` callback events.

- [ ] **Step 1: Write failing component tests**

Cover these exact behaviors:

- Strategy definitions render as buttons with `aria-pressed`.
- Selecting “均线交叉” shows range controls labelled “短均线周期滑块” and “长均线周期滑块”.
- Moving the short window to 50 while the long window is 50 emits `{ short_window: 50, long_window: 51 }`.
- Moving the long window to 20 while the short window is 20 emits `{ short_window: 19, long_window: 20 }`.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `cd frontend && npm test -- --run src/components/StrategyControls.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the controlled component**

Render a `role="group"` strategy button row, strategy description, and one `.parameter-slider` per selected parameter. Each parameter contains a labelled range input and a labelled numeric input. Parse simple two-field validation expressions and clamp the paired value within its catalog bounds when a strict `<` or `>` relationship would be violated.

- [ ] **Step 4: Run the focused tests**

Run: `cd frontend && npm test -- --run src/components/StrategyControls.test.tsx`

Expected: all strategy-control tests PASS.

### Task 3: Dataset Lifecycle and Automatic Backtests

**Files:**
- Modify: `frontend/src/components/BacktestForm.tsx`
- Modify: `frontend/src/components/BacktestForm.test.tsx`

**Interfaces:**
- Consumes: `previewMarketData`, `runBacktestForDataset`, and `StrategyControls`.
- Produces: unchanged `BacktestForm` props and result callbacks.

- [ ] **Step 1: Replace form mocks and write failing workflow tests**

Mock `previewMarketData` and `runBacktestForDataset` separately. Test that:

- The first submit calls preview once, then dataset backtest once.
- After the first result, changing a slider waits 400 milliseconds, calls only dataset backtest, and passes the changed parameter.
- Two rapid parameter changes abort the earlier automatic request and only the latest completion reaches `onRun`.
- Changing the stock symbol clears the ready state and does not auto-run until “加载行情并开始回测” is clicked again.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `cd frontend && npm test -- --run src/components/BacktestForm.test.tsx`

Expected: FAIL because the form still calls the combined workflow and requires submit.

- [ ] **Step 3: Implement request orchestration**

Store the current dataset ID and its market-input fingerprint. The explicit submit validates, loads market data, then runs the dataset backtest. A `useEffect` compares the current strategy/assumption signature with the last requested signature and schedules a 400 millisecond dataset-only run. Market-input changes clear the dataset ID and cancel the active request. Use one request helper and an `AbortController` so only the active request updates state.

- [ ] **Step 4: Replace strategy markup and status copy**

Render `StrategyControls` in place of the strategy select and number fields. Before loading, show “加载行情并开始回测”. After loading, show an `aria-live="polite"` status reading “参数调整后自动回测”; while an automatic request is active, read “正在自动回测…”.

- [ ] **Step 5: Run form tests**

Run: `cd frontend && npm test -- --run src/components/BacktestForm.test.tsx`

Expected: all form tests PASS.

### Task 4: Responsive Visual Styling and Full Verification

**Files:**
- Modify: `frontend/src/styles.css`
- Modify: `README.md`

**Interfaces:**
- Consumes: class names from `StrategyControls` and `BacktestForm`.
- Produces: selected, hover, focus, running, mobile, and range-track styles.

- [ ] **Step 1: Add responsive styles**

Style strategy buttons as a compact wrapping grid, selected buttons with the existing teal accent, slider rows with a filled-looking accent track and tabular value box, and auto-run status as a calm inline notice. At widths below 560px, stack the slider label/value and preserve a minimum 44px touch target.

- [ ] **Step 2: Update the usage documentation**

Document that the first click loads the selected market data and that later strategy/parameter changes automatically reuse it. Explain that editing market-data fields requires reloading.

- [ ] **Step 3: Run all verification**

Run: `PATH="$PWD/.venv/bin:$PATH" npm run test`

Expected: Node, backend, and frontend suites all PASS.

Run: `PATH="$PWD/.venv/bin:$PATH" npm run build`

Expected: TypeScript and Vite production build PASS.

Run: `git diff --check`

Expected: no output.
