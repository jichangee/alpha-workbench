# Rebalancing and shadcn/ui Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add independently configurable periodic rebalancing to portfolio comparisons and rebuild the complete React interface with shadcn/ui without changing existing backtest behavior.

**Architecture:** Extend each portfolio definition with a backward-compatible rebalance frequency, calculate portfolio equity by carrying and periodically resetting drifted weights, and echo actual rebalance dates in the response. Keep API/request orchestration inside existing feature components while replacing ad-hoc interface elements with a Radix-based shadcn design system.

**Tech Stack:** Python 3.13, FastAPI, Pydantic, pandas, pytest, React 19, TypeScript, Vite, Vitest, Testing Library, Tailwind CSS, shadcn/ui (Radix), ECharts.

## Global Constraints

- Rebalancing belongs only to the multi-asset portfolio comparison workflow; do not add a fifth single-asset strategy.
- Supported frequencies are exactly `none`, `monthly`, `quarterly`, and `yearly`; omitted values default to `none`.
- Rebalance after the last common close of a period and apply restored target weights from the next common trading day.
- Allow fractional holdings and exclude cash, commission, slippage, taxes, turnover, drift thresholds, and custom dates.
- Preserve the existing API paths, ECharts charts, automatic backtest debounce, dataset reuse, and request cancellation.
- Use shadcn/ui with Radix, `new-york` styling, dark zinc surfaces, one emerald accent, Geist Sans, and Geist Mono for metrics.
- Preserve the user's current uncommitted Sharpe-ratio changes. Do not stage or commit implementation files because those changes overlap the files in this plan.
- Run root tests with the project virtual environment: `PATH="$PWD/.venv/bin:$PATH" npm run test`.
- For every behavior change, write and run the failing test before editing production code.

---

### Task 1: Backend Rebalancing Contract and Calculation

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/portfolio_comparison.py`
- Test: `backend/tests/test_portfolio_comparison.py`
- Test: `backend/tests/test_portfolio_comparison_api.py`

**Interfaces:**
- Produces: `RebalanceFrequency = Literal["none", "monthly", "quarterly", "yearly"]`
- Produces: `PortfolioDefinition.rebalance_frequency: RebalanceFrequency`
- Produces: `PortfolioComparisonSeries.rebalance_frequency: RebalanceFrequency`
- Produces: `PortfolioComparisonSeries.rebalance_dates: list[date]`
- Consumes: existing aligned adjusted-close `pd.DataFrame`

- [ ] **Step 1: Write failing schema and calculation tests**

Add tests that prove the omitted default, monthly reset timing, terminal-date exclusion, and API aliases:

```python
def test_defaults_to_no_rebalancing():
    request = PortfolioComparisonRequest.model_validate(request_payload())
    assert request.portfolios[0].rebalance_frequency == "none"


def test_monthly_rebalancing_resets_drifted_weights_after_period_close():
    payload = request_payload()
    payload["portfolios"][0]["rebalanceFrequency"] = "monthly"
    request = PortfolioComparisonRequest.model_validate(payload)
    dates = ["2024-01-30", "2024-01-31", "2024-02-01", "2024-02-29", "2024-03-01"]

    result = calculate_portfolio_comparison(
        request,
        {
            "AAA": frame(dates, [100, 200, 200, 100, 100]),
            "BBB": frame(dates, [100, 100, 100, 200, 200]),
        },
    )

    assert result.portfolios[0].equity == pytest.approx([100, 150, 150, 187.5, 187.5])
    assert result.portfolios[0].rebalance_dates == [
        date(2024, 1, 31),
        date(2024, 2, 29),
    ]


@pytest.mark.parametrize(
    ("frequency", "dates", "expected"),
    [
        (
            "quarterly",
            ["2024-03-27", "2024-03-28", "2024-04-01"],
            [date(2024, 3, 28)],
        ),
        (
            "yearly",
            ["2024-12-30", "2024-12-31", "2025-01-02"],
            [date(2024, 12, 31)],
        ),
    ],
)
def test_identifies_calendar_rebalance_boundaries(frequency, dates, expected):
    payload = request_payload()
    payload["portfolios"][0]["rebalanceFrequency"] = frequency
    request = PortfolioComparisonRequest.model_validate(payload)
    result = calculate_portfolio_comparison(
        request,
        {
            "AAA": frame(dates, [100, 100, 100]),
            "BBB": frame(dates, [100, 100, 100]),
        },
    )
    assert result.portfolios[0].rebalance_dates == expected


def test_does_not_record_a_terminal_rebalance():
    payload = request_payload()
    payload["portfolios"][0]["rebalanceFrequency"] = "monthly"
    request = PortfolioComparisonRequest.model_validate(payload)
    result = calculate_portfolio_comparison(
        request,
        {
            "AAA": frame(["2024-01-30", "2024-01-31"], [100, 110]),
            "BBB": frame(["2024-01-30", "2024-01-31"], [100, 90]),
        },
    )
    assert result.portfolios[0].rebalance_dates == []


def test_rejects_an_unsupported_rebalance_frequency():
    payload = request_payload()
    payload["portfolios"][0]["rebalanceFrequency"] = "weekly"

    with pytest.raises(ValidationError, match="none|monthly|quarterly|yearly"):
        PortfolioComparisonRequest.model_validate(payload)
```

Extend the API success assertion:

```python
assert payload["portfolios"][0]["rebalanceFrequency"] == "none"
assert payload["portfolios"][0]["rebalanceDates"] == []
```

- [ ] **Step 2: Run the new backend tests and verify RED**

Run:

```bash
cd backend
../.venv/bin/python -m pytest \
  tests/test_portfolio_comparison.py \
  tests/test_portfolio_comparison_api.py -q
```

Expected: failures because `rebalance_frequency` and serialized rebalance fields do not exist.

- [ ] **Step 3: Add the schema contract**

Add the exact alias-aware fields:

```python
RebalanceFrequency = Literal["none", "monthly", "quarterly", "yearly"]


class PortfolioDefinition(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, populate_by_name=True)

    name: str = Field(min_length=1, max_length=40)
    positions: list[PortfolioPosition] = Field(min_length=1, max_length=8)
    rebalance_frequency: RebalanceFrequency = Field(
        default="none",
        validation_alias="rebalanceFrequency",
        serialization_alias="rebalanceFrequency",
    )


class PortfolioComparisonSeries(BaseModel):
    name: str
    positions: list[PortfolioPosition]
    rebalance_frequency: RebalanceFrequency = Field(
        serialization_alias="rebalanceFrequency"
    )
    rebalance_dates: list[date] = Field(serialization_alias="rebalanceDates")
    equity: list[float]
    metrics: PortfolioComparisonMetrics
```

- [ ] **Step 4: Replace the buy-and-hold-only calculation with weight carry**

Use period keys and a single deterministic loop:

```python
def _period_key(timestamp: pd.Timestamp, frequency: str) -> tuple[int, ...]:
    if frequency == "monthly":
        return (timestamp.year, timestamp.month)
    if frequency == "quarterly":
        return (timestamp.year, (timestamp.month - 1) // 3 + 1)
    if frequency == "yearly":
        return (timestamp.year,)
    return ()


def _portfolio_equity(portfolio, closes: pd.DataFrame) -> tuple[pd.Series, list]:
    symbols = [position.symbol for position in portfolio.positions]
    prices = closes[symbols]
    target_weights = np.asarray(
        [position.weight for position in portfolio.positions],
        dtype=float,
    )
    weights = target_weights.copy()
    values = [100.0]
    rebalance_dates = []

    for offset in range(1, len(prices)):
        relatives = (
            prices.iloc[offset].to_numpy(dtype=float)
            / prices.iloc[offset - 1].to_numpy(dtype=float)
        )
        growth = float(np.dot(weights, relatives))
        values.append(values[-1] * growth)
        weights = weights * relatives / growth

        has_next = offset < len(prices) - 1
        frequency = portfolio.rebalance_frequency
        if (
            has_next
            and frequency != "none"
            and _period_key(prices.index[offset], frequency)
            != _period_key(prices.index[offset + 1], frequency)
        ):
            weights = target_weights.copy()
            rebalance_dates.append(prices.index[offset].date())

    return pd.Series(values, index=prices.index), rebalance_dates
```

Call this helper from `_calculate_portfolio`, calculate metrics from the returned series, and populate:

```python
equity, rebalance_dates = _portfolio_equity(portfolio, closes)
return PortfolioComparisonSeries(
    name=portfolio.name,
    positions=portfolio.positions,
    rebalance_frequency=portfolio.rebalance_frequency,
    rebalance_dates=rebalance_dates,
    equity=[round(float(value), 10) for value in equity],
    metrics=metrics,
)
```

- [ ] **Step 5: Run focused and full backend tests**

Run:

```bash
cd backend
../.venv/bin/python -m pytest tests/test_portfolio_comparison.py tests/test_portfolio_comparison_api.py -q
../.venv/bin/python -m pytest -q
```

Expected: focused tests pass; full backend suite reports at least 99 passing tests and no failures.

- [ ] **Step 6: Record a non-staging checkpoint**

Run:

```bash
git diff --check -- backend/app/schemas.py backend/app/portfolio_comparison.py \
  backend/tests/test_portfolio_comparison.py backend/tests/test_portfolio_comparison_api.py
```

Expected: no output. Do not stage these files because they contain user-owned baseline changes.

---

### Task 2: Frontend Rebalancing Types, Form, and Results

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api.test.ts`
- Modify: `frontend/src/portfolioComparisonFixture.ts`
- Modify: `frontend/src/components/PortfolioComparisonForm.test.tsx`
- Modify: `frontend/src/components/PortfolioComparisonForm.tsx`
- Modify: `frontend/src/components/PortfolioComparisonResults.test.tsx`
- Modify: `frontend/src/components/PortfolioComparisonResults.tsx`

**Interfaces:**
- Produces: `RebalanceFrequency`
- Produces: `PortfolioDefinitionInput.rebalanceFrequency`
- Consumes: API fields `rebalanceFrequency` and `rebalanceDates`
- Preserves: existing `PortfolioComparisonInput` request path and cancellation behavior

- [ ] **Step 1: Write failing form, request, and results tests**

Add a form behavior test:

```tsx
it('submits an independent rebalance frequency for each portfolio', async () => {
  const user = userEvent.setup()
  const onCompare = vi.fn()
  render(<PortfolioComparisonForm onCompare={onCompare} running={false} />)

  await user.selectOptions(
    screen.getByLabelText('持仓 1 再平衡策略'),
    'monthly',
  )
  await user.click(screen.getByRole('button', { name: '开始对比' }))

  expect(onCompare.mock.calls[0][0].portfolios).toEqual([
    expect.objectContaining({ rebalanceFrequency: 'monthly' }),
    expect.objectContaining({ rebalanceFrequency: 'none' }),
  ])
})
```

Add a result assertion:

```tsx
expect(screen.getByText('每月再平衡')).toBeVisible()
expect(screen.getByText('2 次再平衡')).toBeVisible()
```

Update the API fixture and exact request body so each portfolio includes its frequency.

- [ ] **Step 2: Run frontend feature tests and verify RED**

Run:

```bash
cd frontend
npm run test -- --run \
  src/api.test.ts \
  src/components/PortfolioComparisonForm.test.tsx \
  src/components/PortfolioComparisonResults.test.tsx
```

Expected: type or assertion failures because the new fields and controls are absent.

- [ ] **Step 3: Add shared TypeScript types and fixture fields**

Add:

```ts
export type RebalanceFrequency = 'none' | 'monthly' | 'quarterly' | 'yearly'

export interface PortfolioDefinitionInput {
  name: string
  positions: PortfolioPositionInput[]
  rebalanceFrequency: RebalanceFrequency
}

export interface PortfolioComparisonSeries extends PortfolioDefinitionInput {
  rebalanceDates: string[]
  equity: number[]
  metrics: PortfolioComparisonMetrics
}
```

Every comparison fixture must include `rebalanceFrequency` and `rebalanceDates`.

- [ ] **Step 4: Add portfolio-level frequency state and submission**

Extend `PortfolioDraft`:

```ts
interface PortfolioDraft {
  id: number
  number: number
  name: string
  rebalanceFrequency: RebalanceFrequency
  positions: PositionDraft[]
}
```

Set every initial/new portfolio to `none`, render a labeled frequency control with the four exact values, and include:

```ts
{
  name: portfolio.name.trim(),
  rebalanceFrequency: portfolio.rebalanceFrequency,
  positions: portfolio.positions.map(/* existing normalization */),
}
```

- [ ] **Step 5: Render strategy labels and actual counts**

Create a closed label map:

```ts
const rebalanceLabels: Record<RebalanceFrequency, string> = {
  none: '不再平衡',
  monthly: '每月再平衡',
  quarterly: '每季度再平衡',
  yearly: '每年再平衡',
}
```

Render the label and `${portfolio.rebalanceDates.length} 次再平衡` in each portfolio summary. Change the chart explanation to “各组起点均为 100，按各自策略管理目标权重。”

- [ ] **Step 6: Run focused and full frontend tests**

Run:

```bash
cd frontend
npm run test -- --run \
  src/api.test.ts \
  src/components/PortfolioComparisonForm.test.tsx \
  src/components/PortfolioComparisonResults.test.tsx
npm run test -- --run
```

Expected: all frontend tests pass.

---

### Task 3: Tailwind and shadcn/ui Foundation

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `frontend/components.json`
- Modify: `frontend/tsconfig.json`
- Modify: `frontend/vite.config.ts`
- Create: `frontend/src/lib/utils.ts`
- Create: `frontend/src/components/ui/*.tsx`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/src/main.tsx`

**Interfaces:**
- Produces: `@/*` alias to `frontend/src/*`
- Produces: shadcn primitives under `@/components/ui`
- Produces: dark zinc/emerald theme tokens and literal Geist font tokens

- [ ] **Step 1: Add the Vite alias needed by shadcn**

Add to `tsconfig.json`:

```json
"baseUrl": ".",
"paths": {
  "@/*": ["./src/*"]
}
```

Add to `vite.config.ts`:

```ts
import { fileURLToPath, URL } from 'node:url'

resolve: {
  alias: {
    '@': fileURLToPath(new URL('./src', import.meta.url)),
  },
},
```

- [ ] **Step 2: Initialize shadcn non-interactively and add only required components**

Run from `frontend`:

```bash
npx shadcn@latest init -d --base radix
npx shadcn@latest add \
  alert badge button card input label radio-group select separator \
  skeleton slider table tabs toggle-group
npm install @fontsource-variable/geist @fontsource-variable/geist-mono
```

Expected: `components.json`, `src/lib/utils.ts`, UI source files, Tailwind dependencies, and lockfile updates are created.

- [ ] **Step 3: Define the approved theme and font imports**

Import fonts before application CSS:

```ts
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './styles.css'
```

Keep shadcn's Tailwind import and use literal font values:

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --font-sans: "Geist Variable", "Geist", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Geist Mono Variable", "Geist Mono", ui-monospace, monospace;
}

:root {
  color-scheme: dark;
  --radius: 0.625rem;
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --primary: oklch(0.696 0.17 162.48);
  --primary-foreground: oklch(0.145 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 12%);
  --input: oklch(1 0 0 / 16%);
  --ring: oklch(0.696 0.17 162.48);
}
```

- [ ] **Step 4: Verify the generated design-system baseline**

Run:

```bash
cd frontend
npx shadcn@latest info
npm run build
```

Expected: shadcn reports a Vite/Radix project and TypeScript/Vite build exits 0.

---

### Task 4: shadcn Application Shell and Backtest Workspace

**Files:**
- Modify: `frontend/src/App.test.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/BacktestForm.tsx`
- Modify: `frontend/src/components/StrategyControls.test.tsx`
- Modify: `frontend/src/components/StrategyControls.tsx`
- Modify: `frontend/src/components/PositionModeControls.tsx`

**Interfaces:**
- Consumes: shadcn `Tabs`, `Card`, `Alert`, `Skeleton`, `Button`, `Input`, `Label`, `Select`, `Slider`, `RadioGroup`, and `ToggleGroup`
- Preserves: all existing backtest form values, validation, dataset lifecycle, debounce, cancellation, and output callbacks

- [ ] **Step 1: Write failing application-shell accessibility tests**

Add:

```tsx
expect(screen.getByRole('banner')).toHaveTextContent('美股量化研究台')
expect(screen.getByText('本地运行')).toBeVisible()
```

Update the strategy slider test to use `getByRole('slider', { name: '短均线周期滑块' })`, matching the Radix slider contract.

- [ ] **Step 2: Run shell and control tests and verify RED**

Run:

```bash
cd frontend
npm run test -- --run \
  src/App.test.tsx \
  src/components/BacktestForm.test.tsx \
  src/components/StrategyControls.test.tsx \
  src/components/PositionModeControls.test.tsx
```

Expected: the new banner/status assertions fail before the rewrite.

- [ ] **Step 3: Recompose the application shell**

Use a root dark shell with a banner outside `<main>`, a `Badge` for “本地运行”, an `Alert` risk notice, and controlled shadcn `Tabs`:

```tsx
<div className="min-h-screen bg-background text-foreground">
  <header role="banner" className="border-b border-border/70">
    {/* title, local badge, and research disclaimer */}
  </header>
  <main className="mx-auto max-w-[1680px] p-4 md:p-6">
    <Tabs
      value={activeWorkspace}
      onValueChange={(value) => setActiveWorkspace(value as WorkspaceMode)}
    >
      <TabsList aria-label="分析模式">
        <TabsTrigger value="backtest">策略回测</TabsTrigger>
        <TabsTrigger value="portfolio">持仓对比</TabsTrigger>
      </TabsList>
      <TabsContent value="backtest">{/* existing workflow */}</TabsContent>
      <TabsContent value="portfolio">
        <PortfolioComparisonWorkspace />
      </TabsContent>
    </Tabs>
  </main>
</div>
```

- [ ] **Step 4: Replace backtest form surfaces without changing orchestration**

Keep hooks, validation, request methods, fingerprints, and effects unchanged. Replace only rendered controls:

- `Card`/`CardHeader`/`CardContent` for market, strategy, and execution groups.
- `Select` for market source.
- `Input` and `Label` for symbols, dates, CSV, cash, commission, and slippage.
- `Button` for initial load and running state.
- `Alert` for errors.
- `Badge` and live text for loaded/automatic-run state.

- [ ] **Step 5: Rebuild strategy and position controls with Radix primitives**

Use `ToggleGroup` for strategy cards, `Slider` plus numeric `Input` for parameters, and `RadioGroup` for cash/rotation mode. Preserve the exact visible labels and callback payloads used by current tests.

- [ ] **Step 6: Run focused tests**

Run:

```bash
cd frontend
npm run test -- --run \
  src/App.test.tsx \
  src/components/BacktestForm.test.tsx \
  src/components/StrategyControls.test.tsx \
  src/components/PositionModeControls.test.tsx
```

Expected: all focused tests pass without changing backtest API mocks or timing assertions.

---

### Task 5: shadcn Portfolio and Results Workspaces

**Files:**
- Modify: `frontend/src/components/PortfolioComparisonWorkspace.tsx`
- Modify: `frontend/src/components/PortfolioComparisonForm.tsx`
- Modify: `frontend/src/components/PortfolioComparisonResults.tsx`
- Modify: `frontend/src/components/ResultsDashboard.test.tsx`
- Modify: `frontend/src/components/ResultsDashboard.tsx`
- Modify: `frontend/src/components/MetricCards.tsx`
- Modify: `frontend/src/components/TradesTable.tsx`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes: shadcn `Card`, `Badge`, `Button`, `Input`, `Label`, `Select`, `Table`, `Tabs`, `Alert`, and `Skeleton`
- Preserves: ECharts components and comparison/backtest request ownership

- [ ] **Step 1: Write a failing semantic chart-tab test**

Change the dashboard chart-view expectation to tabs:

```tsx
expect(screen.getByRole('tab', { name: '绩效走势' }))
  .toHaveAttribute('aria-selected', 'true')
await user.click(screen.getByRole('tab', { name: '价格与信号' }))
expect(screen.getByRole('tab', { name: '价格与信号' }))
  .toHaveAttribute('aria-selected', 'true')
```

- [ ] **Step 2: Run result tests and verify RED**

Run:

```bash
cd frontend
npm run test -- --run \
  src/components/ResultsDashboard.test.tsx \
  src/components/PortfolioComparisonWorkspace.test.tsx \
  src/components/PortfolioComparisonForm.test.tsx \
  src/components/PortfolioComparisonResults.test.tsx
```

Expected: chart tab-role assertions fail against the old ordinary buttons.

- [ ] **Step 3: Recompose both result dashboards**

- Use `Card` for summary groups and chart surfaces.
- Use controlled `Tabs` for “绩效走势 / 价格与信号”.
- Use `Alert` for warnings and open-position status.
- Use shadcn `Table` wrappers for metrics and trades while retaining captions, headers, values, and horizontal scrolling.
- Keep `React.lazy`, `Suspense`, and every ECharts prop unchanged.

- [ ] **Step 4: Recompose the portfolio workspace and editor**

- Use a responsive `grid-cols-1 xl:grid-cols-[minmax(460px,600px)_minmax(0,1fr)]`.
- Keep request cancellation and stale-response guards unchanged.
- Use `Skeleton` inside the result placeholder while running.
- Use `Alert` for API failures.
- Use Cards and the shadcn Select for each portfolio's frequency.
- Use icon Buttons for add/remove actions while preserving accessible names.

- [ ] **Step 5: Remove obsolete ad-hoc CSS**

Delete selectors replaced by Tailwind/shadcn composition. Keep only:

- Tailwind/shadcn theme layers.
- ECharts canvas sizes and responsive chart heights.
- Screen-reader helper behavior not already provided.
- Reduced-motion safeguards.

Do not keep light-theme hex surface rules or per-portfolio background color classes.

- [ ] **Step 6: Run the full frontend suite and build**

Run:

```bash
cd frontend
npm run test -- --run
npm run build
```

Expected: all frontend tests pass and the production build exits 0.

---

### Task 6: Documentation, React Review, and Full Verification

**Files:**
- Modify: `README.md`
- Review: all changed files

**Interfaces:**
- Documents: per-portfolio rebalance frequencies and close-to-close timing
- Verifies: full local development contract

- [ ] **Step 1: Update the user-facing portfolio description**

Replace the no-rebalancing-only wording with:

```markdown
“持仓对比”支持每组组合独立选择不再平衡、每月、每季度或每年再平衡。
定期再平衡在相应周期最后一个共同交易日收盘后执行，并从下一交易日开始恢复目标权重。
组合比较允许碎股且不计交易成本；单标的策略回测的成交与成本规则保持不变。
```

- [ ] **Step 2: Run the React best-practices review**

Inspect every changed TSX file for:

- one focused component per file;
- complete hook dependencies and effect cleanup;
- derived state rather than synchronized duplicate state;
- semantic controls and keyboard operation;
- stable keys for editable/reorderable lists;
- shadcn primitives instead of repeated ad-hoc bordered containers;
- Geist Mono only for metrics, dates, symbols, and tabular values.

Make only fixes required by this checklist, then rerun affected tests.

- [ ] **Step 3: Verify formatting and repository scope**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only the approved implementation, README, generated shadcn files, dependency manifests, and pre-existing Sharpe-ratio changes appear.

- [ ] **Step 4: Run fresh complete verification**

Run:

```bash
PATH="$PWD/.venv/bin:$PATH" npm run test
npm run build
```

Expected:

- launcher tests pass;
- backend suite passes with no failures;
- frontend Vitest suite passes with no failures;
- TypeScript/Vite production build exits 0.

- [ ] **Step 5: Check each acceptance criterion against evidence**

Confirm:

1. Two to five portfolios can independently select all four frequencies.
2. Same holdings with different frequencies produce independently calculated curves.
3. Omitted and `none` requests retain existing results.
4. API returns actual dates and UI displays frequency/count.
5. Both workspaces consistently use the shadcn design system.
6. Desktop/mobile layouts keep controls reachable.
7. Full tests and build have fresh passing output.
8. The original uncommitted Sharpe-ratio work remains present.

Do not commit or stage implementation changes without explicit user approval.
