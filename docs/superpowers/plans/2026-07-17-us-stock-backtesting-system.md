# US Stock Backtesting System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local browser-based application that runs trustworthy single-symbol US stock daily backtests through a no-code Chinese interface.

**Architecture:** A React/TypeScript SPA calls a FastAPI service. The service normalizes Yahoo/CSV market data, generates target-position signals, executes them on the next session open, and serializes metrics and chart series. The pure Python engine has no HTTP dependencies and is tested with fixed fixtures before API and UI integration.

**Tech Stack:** Python 3.11+, FastAPI, Pydantic 2, pandas, NumPy, yfinance, pytest; Node.js 20+, React 19, TypeScript, Vite, ECharts, Vitest, Testing Library.

## Global Constraints

- The first release supports one symbol, one strategy, daily bars, integer shares, long-only positions, and no leverage.
- Signals are calculated at the close and executed at the next trading session open.
- Built-in strategies are buy-and-hold, SMA crossover, RSI reversal, and Donchian breakout.
- Default initial cash is USD 100,000, commission is USD 0 per fill, and slippage is 5 basis points.
- Yahoo adjusted daily OHLCV is the default source; CSV upload is the fallback.
- UI copy, validation, empty states, and actionable errors are in Simplified Chinese.
- The backtest engine must not depend on FastAPI, React, or a network connection.

---

### Task 1: Backend contract and strategy catalog

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Create: `backend/app/schemas.py`
- Create: `backend/app/catalog.py`
- Create: `backend/tests/test_api_basics.py`

**Interfaces:**
- Produces: `app.main.app: FastAPI`
- Produces: `GET /api/health -> {"status": "ok"}`
- Produces: `GET /api/strategies -> list[StrategyDefinition]`
- Produces: `StrategyConfig(key: str, params: dict[str, float | int])`

- [ ] **Step 1: Add the Python package manifest and write failing endpoint tests**

```python
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_reports_ok():
    assert client.get("/api/health").json() == {"status": "ok"}

def test_strategy_catalog_exposes_four_no_code_strategies():
    response = client.get("/api/strategies")
    assert response.status_code == 200
    assert {item["key"] for item in response.json()} == {
        "buy_hold", "sma_cross", "rsi_reversal", "donchian"
    }
```

- [ ] **Step 2: Run the tests and verify collection fails because `app.main` does not exist**

Run: `cd backend && python -m pytest tests/test_api_basics.py -q`

Expected: FAIL during import with `ModuleNotFoundError: No module named 'app'`.

- [ ] **Step 3: Implement the minimal FastAPI app, typed schemas, and complete strategy metadata**

```python
class StrategyConfig(BaseModel):
    key: Literal["buy_hold", "sma_cross", "rsi_reversal", "donchian"]
    params: dict[str, float | int] = Field(default_factory=dict)

@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

@app.get("/api/strategies", response_model=list[StrategyDefinition])
def strategies() -> list[StrategyDefinition]:
    return STRATEGIES
```

The catalog must include Chinese names, explanations, parameter type, default, minimum, maximum, and the cross-field rules `short_window < long_window` and `oversold < overbought`.

- [ ] **Step 4: Run tests and static import checks**

Run: `cd backend && python -m pytest tests/test_api_basics.py -q`

Expected: 2 passed with no warnings.

- [ ] **Step 5: Commit the backend contract**

```bash
git add backend
git commit -m "feat: add backtest API contract"
```

### Task 2: Market data normalization, Yahoo loading, and CSV datasets

**Files:**
- Create: `backend/app/market_data.py`
- Create: `backend/app/datasets.py`
- Create: `backend/tests/fixtures/prices.csv`
- Create: `backend/tests/test_market_data.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/schemas.py`

**Interfaces:**
- Produces: `normalize_bars(frame: pd.DataFrame) -> pd.DataFrame`
- Produces: `load_yahoo(symbol: str, start: date, end: date) -> pd.DataFrame`
- Produces: `DatasetStore.put(frame: pd.DataFrame, metadata: DatasetMetadata) -> str`
- Produces: `DatasetStore.get(dataset_id: str) -> pd.DataFrame`
- Produces: `POST /api/market-data/preview` as multipart form with `source`, optional `file`, `symbol`, `start`, and `end`
- Produces response: `{datasetId, symbol, start, end, rows, preview, warnings}`

- [ ] **Step 1: Write failing normalization and CSV validation tests**

```python
def test_normalize_bars_sorts_deduplicates_and_standardizes_columns():
    raw = pd.DataFrame({
        "date": ["2024-01-03", "2024-01-02", "2024-01-02"],
        "open": [102, 100, 100], "high": [104, 102, 102],
        "low": [101, 99, 99], "close": [103, 101, 101],
    })
    bars = normalize_bars(raw)
    assert list(bars.columns[:4]) == ["Open", "High", "Low", "Close"]
    assert bars.index.is_monotonic_increasing
    assert len(bars) == 2

def test_normalize_bars_rejects_close_outside_daily_range():
    raw = valid_frame().assign(Close=999)
    with pytest.raises(MarketDataError, match="收盘价必须位于最高价和最低价之间"):
        normalize_bars(raw)
```

- [ ] **Step 2: Verify the tests fail because the normalizer is absent**

Run: `cd backend && python -m pytest tests/test_market_data.py -q`

Expected: FAIL importing `app.market_data`.

- [ ] **Step 3: Implement normalization, a disk cache for Yahoo data, and an in-memory dataset registry**

```python
REQUIRED = ("Open", "High", "Low", "Close")

def normalize_bars(frame: pd.DataFrame) -> pd.DataFrame:
    bars = frame.copy()
    bars.columns = [str(column).strip().title() for column in bars.columns]
    if "Date" in bars.columns:
        bars = bars.set_index("Date")
    bars.index = pd.to_datetime(bars.index, errors="raise").tz_localize(None)
    bars = bars[~bars.index.duplicated(keep="last")].sort_index()
    # Raise MarketDataError with Chinese messages for missing, nonnumeric,
    # nonpositive, or internally inconsistent OHLC rows.
    return bars
```

`load_yahoo` must call `yfinance.download(..., auto_adjust=True, progress=False)`, flatten a one-symbol MultiIndex if present, normalize the result, and cache it under `backend/.cache/market-data/`. `DatasetStore` returns UUID identifiers and copies frames on both put and get.

- [ ] **Step 4: Add the multipart preview endpoint and test both CSV success and bad-symbol error mapping**

Run: `cd backend && python -m pytest tests/test_market_data.py tests/test_api_basics.py -q`

Expected: all tests pass; invalid input returns HTTP 422 with `{code, message, fields}` and download failure returns HTTP 400 with `code="MARKET_DATA_ERROR"`.

- [ ] **Step 5: Commit market data support**

```bash
git add backend
git commit -m "feat: add Yahoo and CSV market data"
```

### Task 3: No-code strategy signal generators

**Files:**
- Create: `backend/app/strategies.py`
- Create: `backend/tests/test_strategies.py`

**Interfaces:**
- Consumes: `StrategyConfig`
- Produces: `generate_signals(bars: pd.DataFrame, config: StrategyConfig) -> StrategyOutput`
- Produces: `StrategyOutput(target: pd.Series, indicators: dict[str, pd.Series], warmup: int)`

- [ ] **Step 1: Write one failing timing test for each strategy and failing parameter-validation tests**

```python
def test_sma_cross_changes_target_only_after_a_completed_cross():
    bars = bars_from_closes([10, 10, 10, 11, 12, 9])
    output = generate_signals(bars, StrategyConfig(
        key="sma_cross", params={"short_window": 2, "long_window": 3}
    ))
    assert output.target.tolist() == [0, 0, 0, 1, 1, 0]

def test_sma_rejects_short_window_not_below_long_window():
    with pytest.raises(StrategyError, match="短均线周期必须小于长均线周期"):
        generate_signals(bars_from_closes(range(20)), StrategyConfig(
            key="sma_cross", params={"short_window": 10, "long_window": 5}
        ))
```

RSI tests must use Wilder smoothing and cross detection; Donchian tests must prove the current bar is excluded from its channel; buy-and-hold must return target 1 from the first bar.

- [ ] **Step 2: Run and verify all strategy tests fail on missing implementation**

Run: `cd backend && python -m pytest tests/test_strategies.py -q`

Expected: FAIL importing `app.strategies`.

- [ ] **Step 3: Implement registry-dispatched pure strategy functions**

```python
GENERATORS = {
    "buy_hold": buy_hold,
    "sma_cross": sma_cross,
    "rsi_reversal": rsi_reversal,
    "donchian": donchian,
}

def generate_signals(bars: pd.DataFrame, config: StrategyConfig) -> StrategyOutput:
    try:
        generator = GENERATORS[config.key]
    except KeyError as exc:
        raise StrategyError("不支持的策略") from exc
    return generator(bars, config.params)
```

Each strategy returns an integer 0/1 target aligned exactly to the bar index plus the indicator series needed by the price chart.

- [ ] **Step 4: Run the focused and full backend suite**

Run: `cd backend && python -m pytest -q`

Expected: all tests pass without network access.

- [ ] **Step 5: Commit strategies**

```bash
git add backend/app/strategies.py backend/tests/test_strategies.py
git commit -m "feat: add visual strategy signals"
```

### Task 4: Execution engine and performance metrics

**Files:**
- Create: `backend/app/engine.py`
- Create: `backend/app/metrics.py`
- Create: `backend/tests/test_engine.py`
- Create: `backend/tests/test_metrics.py`

**Interfaces:**
- Consumes: normalized bars and close-time target series
- Produces: `run_engine(bars, target, initial_cash, commission, slippage_bps) -> EngineResult`
- Produces: `EngineResult(equity: pd.DataFrame, fills: list[Fill], trades: list[Trade], warnings: list[str])`
- Produces: `calculate_metrics(equity: pd.Series, trades: list[Trade], initial_cash: float) -> Metrics`

- [ ] **Step 1: Write failing tests for next-open execution, costs, integer shares, and open-position valuation**

```python
def test_signal_executes_at_next_open_without_lookahead():
    bars = make_bars(opens=[10, 20, 30], closes=[11, 21, 31])
    target = pd.Series([1, 1, 1], index=bars.index)
    result = run_engine(bars, target, 100, commission=0, slippage_bps=0)
    assert result.fills[0].date == bars.index[1]
    assert result.fills[0].price == 20
    assert result.fills[0].shares == 5
    assert result.equity.iloc[-1]["total"] == 155

def test_costs_reduce_purchasing_power_and_sale_proceeds():
    result = run_engine(cost_fixture(), target_fixture(), 1000, commission=2, slippage_bps=10)
    assert result.equity.iloc[-1]["total"] < run_without_costs().equity.iloc[-1]["total"]
```

- [ ] **Step 2: Verify engine tests fail because production code is missing**

Run: `cd backend && python -m pytest tests/test_engine.py tests/test_metrics.py -q`

Expected: FAIL importing `app.engine` and `app.metrics`.

- [ ] **Step 3: Implement a deterministic state machine and round-trip trade ledger**

```python
for position, (date, bar) in enumerate(bars.iterrows()):
    desired = int(target.iloc[position - 1]) if position else 0
    if desired == 1 and shares == 0:
        fill_price = float(bar.Open) * (1 + slippage_bps / 10_000)
        quantity = floor((cash - commission) / fill_price)
        # Record buy only when quantity is positive.
    elif desired == 0 and shares > 0:
        fill_price = float(bar.Open) * (1 - slippage_bps / 10_000)
        # Sell all shares, deduct commission, and close the trade.
    total = cash + shares * float(bar.Close)
```

Build the benchmark from the first executable session and calculate drawdown from each equity curve's running peak.

- [ ] **Step 4: Implement metrics and verify exact known values and undefined edge cases**

Tests must assert total return, CAGR, annualized volatility, Sharpe, max drawdown, trade count, and win rate. Zero volatility and no closed trades serialize as `None`, never infinity or NaN.

Run: `cd backend && python -m pytest tests/test_engine.py tests/test_metrics.py -q`

Expected: all focused tests pass.

- [ ] **Step 5: Commit the trusted engine**

```bash
git add backend/app/engine.py backend/app/metrics.py backend/tests
git commit -m "feat: add next-open backtest engine"
```

### Task 5: Backtest application service and API serialization

**Files:**
- Create: `backend/app/backtests.py`
- Create: `backend/app/serialization.py`
- Create: `backend/tests/test_backtest_api.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/schemas.py`

**Interfaces:**
- Consumes: `datasetId`, `StrategyConfig`, initial cash, commission, and slippage basis points
- Produces: `POST /api/backtests -> BacktestResponse`
- Produces response keys: `metadata`, `metrics`, `series`, `indicators`, `fills`, `trades`, `warnings`

- [ ] **Step 1: Write a failing API integration test with the fixed CSV fixture**

```python
def test_backtest_returns_json_safe_metrics_series_and_trades(client, dataset_id):
    response = client.post("/api/backtests", json={
        "datasetId": dataset_id,
        "strategy": {"key": "sma_cross", "params": {"short_window": 2, "long_window": 3}},
        "initialCash": 100000,
        "commission": 0,
        "slippageBps": 5,
    })
    assert response.status_code == 200
    body = response.json()
    assert body["metadata"]["execution"] == "next_open"
    assert len(body["series"]["equity"]) == fixture_row_count
    assert "maxDrawdown" in body["metrics"]
```

- [ ] **Step 2: Verify the endpoint returns 404 before implementation**

Run: `cd backend && python -m pytest tests/test_backtest_api.py -q`

Expected: FAIL because `/api/backtests` returns 404.

- [ ] **Step 3: Implement orchestration and JSON-safe serialization**

`run_backtest` must retrieve a copy of the dataset, generate signals, execute the engine, calculate metrics, and serialize dates as `YYYY-MM-DD`. Convert NumPy scalars to Python scalars and all NaN/Infinity values to `None` before constructing the response.

- [ ] **Step 4: Add field-level error tests and run the entire backend suite**

Run: `cd backend && python -m pytest -q`

Expected: all tests pass; missing datasets return 404 `DATASET_NOT_FOUND`, strategy validation returns 422 `VALIDATION_ERROR`, and insufficient data returns 400 `BACKTEST_ERROR`.

- [ ] **Step 5: Commit the complete backend**

```bash
git add backend
git commit -m "feat: expose backtest results API"
```

### Task 6: React configuration workflow

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/api.ts`
- Create: `frontend/src/types.ts`
- Create: `frontend/src/components/BacktestForm.tsx`
- Create: `frontend/src/components/BacktestForm.test.tsx`
- Create: `frontend/src/styles.css`

**Interfaces:**
- Consumes: `/api/strategies`, `/api/market-data/preview`, `/api/backtests`
- Produces: `BacktestForm` callbacks `onRun(result: BacktestResponse)` and `onStateChange(state: RunState)`
- Produces: responsive Chinese configuration panel with Yahoo and CSV sources

- [ ] **Step 1: Scaffold test configuration and write failing form behavior tests**

```tsx
it('shows only the selected strategy parameters', async () => {
  render(<BacktestForm strategies={catalogFixture} onRun={vi.fn()} />)
  await userEvent.selectOptions(screen.getByLabelText('策略'), 'sma_cross')
  expect(screen.getByLabelText('短均线周期')).toBeVisible()
  expect(screen.getByLabelText('长均线周期')).toBeVisible()
  expect(screen.queryByLabelText('RSI 周期')).not.toBeInTheDocument()
})

it('blocks an invalid moving-average relationship with Chinese guidance', async () => {
  // Enter short=50 and long=20, submit, and expect the documented message.
})
```

- [ ] **Step 2: Run and verify the test fails because `BacktestForm` is missing**

Run: `cd frontend && npm test -- --run src/components/BacktestForm.test.tsx`

Expected: FAIL resolving `./BacktestForm`.

- [ ] **Step 3: Implement API types, the dynamic form, source picker, validation, and loading state**

```ts
export async function runBacktest(input: FormState): Promise<BacktestResponse> {
  const preview = await previewMarketData(input)
  return request('/api/backtests', {
    method: 'POST',
    body: JSON.stringify(toBacktestRequest(input, preview.datasetId)),
  })
}
```

Use native labeled controls, inline help, a disabled/loading submit button, and an `AbortController` so a new run cancels the previous request. Keep user inputs after an error.

- [ ] **Step 4: Run component tests and production type checking**

Run: `cd frontend && npm test -- --run && npm run build`

Expected: tests pass and Vite production build completes without TypeScript errors.

- [ ] **Step 5: Commit the configuration workflow**

```bash
git add frontend
git commit -m "feat: add visual backtest configuration"
```

### Task 7: Metrics, charts, and trade detail dashboard

**Files:**
- Create: `frontend/src/formatters.ts`
- Create: `frontend/src/formatters.test.ts`
- Create: `frontend/src/components/MetricCards.tsx`
- Create: `frontend/src/components/EquityChart.tsx`
- Create: `frontend/src/components/PriceChart.tsx`
- Create: `frontend/src/components/DrawdownChart.tsx`
- Create: `frontend/src/components/TradesTable.tsx`
- Create: `frontend/src/components/ResultsDashboard.tsx`
- Create: `frontend/src/components/ResultsDashboard.test.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes: `BacktestResponse`
- Produces: `ResultsDashboard({result}: {result: BacktestResponse})`
- Produces: `formatCurrency`, `formatPercent`, `formatNumber`, all accepting `number | null`

- [ ] **Step 1: Write failing formatter and dashboard-state tests**

```tsx
expect(formatCurrency(1234.5)).toBe('$1,234.50')
expect(formatPercent(-0.1234)).toBe('-12.34%')
expect(formatPercent(null)).toBe('—')

it('renders strategy and benchmark labels plus an empty closed-trades state', () => {
  render(<ResultsDashboard result={openPositionFixture} />)
  expect(screen.getByText('策略净值')).toBeVisible()
  expect(screen.getByText('买入并持有基准')).toBeVisible()
  expect(screen.getByText('当前持仓尚未平仓')).toBeVisible()
})
```

- [ ] **Step 2: Run tests and verify missing modules cause the expected failure**

Run: `cd frontend && npm test -- --run src/formatters.test.ts src/components/ResultsDashboard.test.tsx`

Expected: FAIL resolving formatter/dashboard modules.

- [ ] **Step 3: Implement the summary, three synchronized ECharts views, and accessible trade table**

The equity chart plots strategy and benchmark normalized to 1.0. The price chart displays candlesticks, returned indicator lines, and buy/sell markers. The drawdown chart uses a negative-value area series. Charts share date-aligned tooltips and resize with their containers.

- [ ] **Step 4: Finish responsive visual styling and run all frontend checks**

Use a restrained navy/slate canvas, white cards, teal primary actions, tabular numbers, visible focus rings, and explicit `+`/`-` signs. At widths below 900px, stack the form and dashboard and allow the trade table itself—not the page—to scroll horizontally.

Run: `cd frontend && npm test -- --run && npm run build`

Expected: all tests pass and the production bundle builds without warnings.

- [ ] **Step 5: Commit the result dashboard**

```bash
git add frontend
git commit -m "feat: visualize backtest performance"
```

### Task 8: One-command local startup and full-story verification

**Files:**
- Create: `package.json`
- Create: `scripts/dev.mjs`
- Create: `.gitignore`
- Create: `README.md`
- Create: `backend/tests/test_fixed_scenario.py`
- Modify: `backend/app/main.py`

**Interfaces:**
- Produces: root command `npm run dev`
- Produces: root command `npm run test`
- Produces: production serving of `frontend/dist` from FastAPI when present

- [ ] **Step 1: Write a failing fixed-scenario acceptance test**

```python
def test_fixed_sma_scenario_has_exact_fill_dates_and_ending_equity():
    result = run_fixed_fixture(strategy="sma_cross", short_window=2, long_window=3)
    assert [fill.date.strftime("%Y-%m-%d") for fill in result.fills] == [
        "2024-01-05", "2024-01-10"
    ]
    assert result.metadata.execution == "next_open"
    assert result.metrics.ending_equity == pytest.approx(EXPECTED_ENDING_EQUITY)
```

Calculate `EXPECTED_ENDING_EQUITY` by hand from the fixture's next-day opens and place the numeric constant directly in the test.

- [ ] **Step 2: Verify the acceptance test fails until the fixed scenario helper is wired**

Run: `cd backend && python -m pytest tests/test_fixed_scenario.py -q`

Expected: FAIL importing `run_fixed_fixture`.

- [ ] **Step 3: Add root orchestration, static production serving, ignores, and setup documentation**

`scripts/dev.mjs` must spawn the FastAPI reload server and Vite dev server, forward `SIGINT`/`SIGTERM`, and exit if either child fails. The README must document Python/Node prerequisites, setup commands, `npm run dev`, CSV column requirements, formula assumptions, and the educational-not-investment-advice disclaimer.

- [ ] **Step 4: Run the complete automated verification**

Run: `npm run test && npm run build`

Expected: backend and frontend tests all pass; the frontend production bundle succeeds.

- [ ] **Step 5: Start the application and manually verify the key flow**

Run: `npm run dev`

Expected: API health responds, the browser UI loads, a CSV fixture can be selected, SMA parameters can be changed, the backtest completes, and metric cards, equity, price, drawdown, and trade detail views render without console errors.

- [ ] **Step 6: Commit the runnable application**

```bash
git add .gitignore README.md package.json scripts backend frontend
git commit -m "feat: deliver local US stock backtester"
```

