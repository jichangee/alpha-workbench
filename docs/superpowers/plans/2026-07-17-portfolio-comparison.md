# 两组持仓历史走势对比 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加一个可编辑两组美股持仓，并比较不再平衡买入持有历史走势和风险收益指标的独立工作区。

**Architecture:** FastAPI 新增组合对比请求/响应模型与纯计算服务，服务通过已有 Yahoo 行情加载器取得复权日线并按共同交易日计算归一化组合净值。React 应用增加工作区切换、受控持仓编辑器、请求编排与独立结果图表，现有策略回测流程保持不变。

**Tech Stack:** Python 3.11、FastAPI、Pydantic 2、Pandas、Pytest；React 19、TypeScript、Vite、Vitest、Testing Library、ECharts 6。

## Global Constraints

- 组合口径必须是首日按目标权重买入、允许碎股、之后不再平衡。
- 恰好比较两组持仓，每组 1 至 8 个唯一股票，所有权重均为有限正数且合计误差不超过 `1e-6`。
- 仅使用 Yahoo 复权日线，并以全部股票的共同交易日对齐；共同观测值少于 2 个时拒绝计算。
- 曲线初始值统一为 100；指标包括累计收益、CAGR、年化波动率和最大回撤。
- 默认持仓为 `50% VOO + 50% QQQ` 与 `100% SOXX`，默认区间为最近五年。
- 不改变现有策略回测、CSV 上传、均线参数和双标的换仓行为。
- 请求只在点击“开始对比”后发送；新请求必须取消旧请求，旧响应不能覆盖新结果。

---

## File Map

- Create `backend/app/portfolio_comparison.py`: 共同日期对齐、买入持有净值与指标计算。
- Modify `backend/app/schemas.py`: 对比请求、持仓、指标和响应 Pydantic 模型。
- Modify `backend/app/main.py`: `POST /api/portfolio-comparisons` 路由和行情错误映射。
- Create `backend/tests/test_portfolio_comparison.py`: 纯计算单元测试。
- Create `backend/tests/test_portfolio_comparison_api.py`: API 合约与校验测试。
- Modify `frontend/src/types.ts`: 持仓编辑状态、API 请求和响应类型。
- Modify `frontend/src/api.ts`: `comparePortfolios` 请求函数。
- Create `frontend/src/components/PortfolioComparisonForm.tsx`: 两组持仓、日期与权重编辑。
- Create `frontend/src/components/PortfolioComparisonChart.tsx`: 两条归一化净值曲线。
- Create `frontend/src/components/PortfolioComparisonResults.tsx`: 区间、构成和指标对照。
- Create `frontend/src/components/PortfolioComparisonWorkspace.tsx`: 请求取消、状态和表单/结果编排。
- Modify `frontend/src/App.tsx`: 策略回测/持仓对比页签。
- Modify `frontend/src/styles.css`: 新工作区响应式视觉样式。
- Add/modify corresponding frontend `*.test.tsx` and `api.test.ts` files.

### Task 1: 组合请求模型与纯计算服务

**Files:**
- Modify: `backend/app/schemas.py`
- Create: `backend/app/portfolio_comparison.py`
- Create: `backend/tests/test_portfolio_comparison.py`

**Interfaces:**
- Consumes: 每个标的为索引是交易日、含 `Close` 列的 `pd.DataFrame`。
- Produces: `calculate_portfolio_comparison(request: PortfolioComparisonRequest, bars_by_symbol: dict[str, pd.DataFrame]) -> PortfolioComparisonResponse` 和 `PortfolioComparisonError`。

- [ ] **Step 1: Write failing schema and calculation tests**

```python
def test_calculates_buy_and_hold_curves_on_common_dates():
    request = PortfolioComparisonRequest.model_validate({
        "start": "2024-01-01", "end": "2024-01-05",
        "portfolios": [
            {"name": "均衡", "positions": [{"symbol": "aaa", "weight": .5}, {"symbol": "BBB", "weight": .5}]},
            {"name": "单股", "positions": [{"symbol": "AAA", "weight": 1}]},
        ],
    })
    result = calculate_portfolio_comparison(request, {
        "AAA": frame(["2024-01-02", "2024-01-03", "2024-01-04"], [100, 110, 120]),
        "BBB": frame(["2024-01-03", "2024-01-04", "2024-01-05"], [100, 100, 90]),
    })
    assert result.dates == [date(2024, 1, 3), date(2024, 1, 4)]
    assert result.portfolios[0].equity == pytest.approx([100, 104.5454545])
    assert result.portfolios[1].equity == pytest.approx([100, 109.0909091])
    assert result.portfolios[0].positions[0].symbol == "AAA"
```

Also assert validation rejects duplicate symbols, zero/non-finite weights, a sum other than 1, more than eight positions, reversed dates, and future end dates; assert fewer than two common observations raises `PortfolioComparisonError`.

- [ ] **Step 2: Run tests and confirm RED**

Run: `cd backend && pytest tests/test_portfolio_comparison.py -q`

Expected: collection fails because `app.portfolio_comparison` and the new schemas do not exist.

- [ ] **Step 3: Implement request/response schemas**

Add models with camel-case serialization where required:

```python
class PortfolioPosition(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, allow_inf_nan=False)
    symbol: str = Field(min_length=1, max_length=15)
    weight: float = Field(gt=0)

    @field_validator("symbol")
    @classmethod
    def normalize_symbol(cls, value: str) -> str:
        return value.upper()

class PortfolioDefinition(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    positions: list[PortfolioPosition] = Field(min_length=1, max_length=8)

    @model_validator(mode="after")
    def validate_positions(self):
        symbols = [position.symbol for position in self.positions]
        if len(symbols) != len(set(symbols)):
            raise ValueError("同一持仓不能重复添加股票")
        if abs(sum(position.weight for position in self.positions) - 1) > 1e-6:
            raise ValueError("每组持仓权重合计必须为 100%")
        return self
```

Add `PortfolioComparisonRequest`, `PortfolioComparisonMetrics`, `PortfolioComparisonSeries`, and `PortfolioComparisonResponse` matching the design document.

- [ ] **Step 4: Implement the pure calculator**

Intersect sorted indexes for all unique symbols, select finite positive `Close` values, normalize each series against its first common close, and calculate:

```python
equity = sum(
    position.weight * closes[position.symbol] / closes[position.symbol].iloc[0]
    for position in portfolio.positions
) * 100
returns = equity.pct_change().dropna()
drawdown = equity / equity.cummax() - 1
```

Use actual calendar days for CAGR and `returns.std(ddof=1) * sqrt(252)` for volatility. Convert NumPy scalars to Python `float`; represent unavailable metrics as `None`.

- [ ] **Step 5: Run tests and confirm GREEN**

Run: `cd backend && pytest tests/test_portfolio_comparison.py -q`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas.py backend/app/portfolio_comparison.py backend/tests/test_portfolio_comparison.py
git commit -m "feat: calculate portfolio comparisons"
```

### Task 2: Portfolio comparison API

**Files:**
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_portfolio_comparison_api.py`

**Interfaces:**
- Consumes: `PortfolioComparisonRequest`, existing `load_yahoo(symbol, start, end)` and Task 1 calculator.
- Produces: `POST /api/portfolio-comparisons` returning `PortfolioComparisonResponse` or the existing `ApiProblem` envelope.

- [ ] **Step 1: Write failing API tests**

```python
def test_portfolio_comparison_downloads_unique_symbols_and_returns_curves(monkeypatch):
    calls = []
    def fake_load(symbol, start, end):
        calls.append(symbol)
        return bars_for(symbol)
    monkeypatch.setattr(main, "load_yahoo", fake_load)
    response = TestClient(main.app).post("/api/portfolio-comparisons", json=valid_request())
    assert response.status_code == 200
    assert calls == ["VOO", "QQQ", "SOXX"]
    assert response.json()["portfolios"][0]["metrics"]["totalReturn"] is not None
```

Add cases for invalid weights returning 422, `MarketDataError` returning 400 with `MARKET_DATA_ERROR`, and no common dates returning 400 with `PORTFOLIO_COMPARISON_ERROR`.

- [ ] **Step 2: Run API tests and confirm RED**

Run: `cd backend && pytest tests/test_portfolio_comparison_api.py -q`

Expected: 404 for the missing endpoint.

- [ ] **Step 3: Implement endpoint**

Add a synchronous route which preserves first-seen symbol order:

```python
@app.post("/api/portfolio-comparisons", response_model=PortfolioComparisonResponse)
def portfolio_comparison(request: PortfolioComparisonRequest):
    symbols = list(dict.fromkeys(
        position.symbol
        for portfolio in request.portfolios
        for position in portfolio.positions
    ))
    try:
        bars = {symbol: load_yahoo(symbol, request.start, request.end) for symbol in symbols}
        return calculate_portfolio_comparison(request, bars)
    except MarketDataError as error:
        return JSONResponse(status_code=400, content={"code": "MARKET_DATA_ERROR", "message": str(error), "fields": {}})
    except PortfolioComparisonError as error:
        return JSONResponse(status_code=400, content={"code": "PORTFOLIO_COMPARISON_ERROR", "message": str(error), "fields": {}})
```

- [ ] **Step 4: Run focused and full backend tests**

Run: `cd backend && pytest tests/test_portfolio_comparison_api.py tests/test_portfolio_comparison.py -q`

Expected: all focused tests pass.

Run: `cd backend && pytest -q`

Expected: the entire backend suite passes without regressions.

- [ ] **Step 5: Commit**

```bash
git add backend/app/main.py backend/tests/test_portfolio_comparison_api.py
git commit -m "feat: expose portfolio comparison api"
```

### Task 3: Frontend types, API client, and editable form

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/api.test.ts`
- Create: `frontend/src/components/PortfolioComparisonForm.tsx`
- Create: `frontend/src/components/PortfolioComparisonForm.test.tsx`

**Interfaces:**
- Consumes: browser form events and existing generic `request<T>`.
- Produces: `PortfolioComparisonInput`, `PortfolioComparisonResponse`, `comparePortfolios(input, signal)`, and `<PortfolioComparisonForm onCompare disabled />`.

- [ ] **Step 1: Write failing API and form tests**

```tsx
it('starts with the recommended two portfolios', () => {
  render(<PortfolioComparisonForm onCompare={vi.fn()} disabled={false} />)
  expect(screen.getByDisplayValue('VOO')).toBeInTheDocument()
  expect(screen.getByDisplayValue('QQQ')).toBeInTheDocument()
  expect(screen.getByDisplayValue('SOXX')).toBeInTheDocument()
  expect(screen.getAllByText('合计 100%')).toHaveLength(2)
})

it('blocks comparison until each portfolio totals 100%', async () => {
  const onCompare = vi.fn()
  render(<PortfolioComparisonForm onCompare={onCompare} disabled={false} />)
  await userEvent.clear(screen.getByLabelText('持仓 1 VOO 权重'))
  await userEvent.type(screen.getByLabelText('持仓 1 VOO 权重'), '40')
  await userEvent.click(screen.getByRole('button', { name: '开始对比' }))
  expect(onCompare).not.toHaveBeenCalled()
  expect(screen.getByText('每组持仓权重合计必须为 100%')).toBeInTheDocument()
})
```

API test must assert a JSON POST to `/api/portfolio-comparisons`, weights converted from UI percentages to decimals, and the provided `AbortSignal` forwarded.

- [ ] **Step 2: Run tests and confirm RED**

Run: `cd frontend && npm test -- --run src/api.test.ts src/components/PortfolioComparisonForm.test.tsx`

Expected: imports fail because the new client and form do not exist.

- [ ] **Step 3: Add exact TypeScript contracts and API call**

```ts
export interface PortfolioPositionInput { symbol: string; weight: number }
export interface PortfolioDefinitionInput { name: string; positions: PortfolioPositionInput[] }
export interface PortfolioComparisonInput { start: string; end: string; portfolios: [PortfolioDefinitionInput, PortfolioDefinitionInput] }
export interface PortfolioComparisonMetrics { totalReturn: number | null; cagr: number | null; annualizedVolatility: number | null; maxDrawdown: number | null }
export interface PortfolioComparisonSeries extends PortfolioDefinitionInput { equity: number[]; metrics: PortfolioComparisonMetrics }
export interface PortfolioComparisonResponse { start: string; end: string; dates: string[]; portfolios: [PortfolioComparisonSeries, PortfolioComparisonSeries] }
```

`comparePortfolios` must call the generic request with `Content-Type: application/json` and return `PortfolioComparisonResponse`.

- [ ] **Step 4: Implement controlled local form state and synchronous validation**

Use the defaults `VOO/50`, `QQQ/50`, and `SOXX/100`; generate a local row id independent of ticker so rows remain stable while editing. On submit trim/uppercase symbols, reject blanks, duplicates, non-positive weights, invalid dates, future end dates, and totals outside a `0.0001` percentage-point tolerance, then convert percentages to decimal weights for `onCompare`.

Buttons and inputs require explicit accessible names. The delete button is disabled when a portfolio has one row, and “添加股票” is disabled at eight rows.

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run: `cd frontend && npm test -- --run src/api.test.ts src/components/PortfolioComparisonForm.test.tsx`

Expected: all focused tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types.ts frontend/src/api.ts frontend/src/api.test.ts frontend/src/components/PortfolioComparisonForm.tsx frontend/src/components/PortfolioComparisonForm.test.tsx
git commit -m "feat: add portfolio comparison form"
```

### Task 4: Results visualization and workspace request lifecycle

**Files:**
- Create: `frontend/src/components/PortfolioComparisonChart.tsx`
- Create: `frontend/src/components/PortfolioComparisonResults.tsx`
- Create: `frontend/src/components/PortfolioComparisonResults.test.tsx`
- Create: `frontend/src/components/PortfolioComparisonWorkspace.tsx`
- Create: `frontend/src/components/PortfolioComparisonWorkspace.test.tsx`

**Interfaces:**
- Consumes: Task 3 form, API client and response contract.
- Produces: `<PortfolioComparisonWorkspace />` with abort-safe request orchestration and `<PortfolioComparisonResults result />`.

- [ ] **Step 1: Write failing result and request lifecycle tests**

```tsx
it('renders both portfolios and all comparison metrics', () => {
  render(<PortfolioComparisonResults result={resultFixture} />)
  expect(screen.getByText('持仓 1')).toBeInTheDocument()
  expect(screen.getByText('持仓 2')).toBeInTheDocument()
  expect(screen.getByText('累计收益')).toBeInTheDocument()
  expect(screen.getByText('最大回撤')).toBeInTheDocument()
})
```

Mock `comparePortfolios`; assert initial placeholder, running copy, successful results, API error copy, and that a second submission aborts the first signal.

- [ ] **Step 2: Run tests and confirm RED**

Run: `cd frontend && npm test -- --run src/components/PortfolioComparisonResults.test.tsx src/components/PortfolioComparisonWorkspace.test.tsx`

Expected: component imports fail.

- [ ] **Step 3: Implement chart and metric comparison**

Initialize ECharts with SVG renderer, use `result.dates` as x-axis and one line per portfolio. Use distinct existing theme-compatible colors, tooltip value formatter `value.toFixed(2)`, resize observer, and dispose on unmount.

Render semantic table rows for cumulative return, annualized return, volatility, and max drawdown. Reuse `formatPercent` for numbers and show `—` for null. Display common start/end and `dates.length` trading days.

- [ ] **Step 4: Implement abort-safe workspace**

Keep `result`, `state`, and `error` locally. Store the active `AbortController` in a ref; abort it before every new request and on unmount. Only update state for the currently active controller, and ignore `AbortError`.

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run: `cd frontend && npm test -- --run src/components/PortfolioComparisonResults.test.tsx src/components/PortfolioComparisonWorkspace.test.tsx`

Expected: all focused tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/PortfolioComparisonChart.tsx frontend/src/components/PortfolioComparisonResults.tsx frontend/src/components/PortfolioComparisonResults.test.tsx frontend/src/components/PortfolioComparisonWorkspace.tsx frontend/src/components/PortfolioComparisonWorkspace.test.tsx
git commit -m "feat: visualize portfolio comparisons"
```

### Task 5: Integrate mode navigation, responsive styling, and regression coverage

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes: completed `PortfolioComparisonWorkspace`.
- Produces: user-visible “策略回测” and “持仓对比” modes without resetting existing backtest results while switching.

- [ ] **Step 1: Write failing integration test**

```tsx
it('switches between backtest and portfolio comparison workspaces', async () => {
  render(<App />)
  await screen.findByRole('button', { name: '运行回测' })
  await userEvent.click(screen.getByRole('tab', { name: '持仓对比' }))
  expect(screen.getByRole('button', { name: '开始对比' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '运行回测' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('tab', { name: '策略回测' }))
  expect(screen.getByRole('button', { name: '运行回测' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run integration test and confirm RED**

Run: `cd frontend && npm test -- --run src/App.test.tsx`

Expected: no “持仓对比” tab exists.

- [ ] **Step 3: Integrate accessible tabs and workspace**

Add `activeWorkspace: 'backtest' | 'portfolio'`; render a `role="tablist"` with `aria-selected`. Preserve the current backtest states in `App` so switching back restores the prior result. Update header copy/badge according to the active workspace without reloading the strategy catalog.

- [ ] **Step 4: Add responsive styles**

Add styles for `.workspace-tabs`, `.portfolio-workspace`, `.portfolio-form`, `.portfolio-card`, `.position-row`, `.weight-total`, `.portfolio-results`, `.portfolio-metric-table`, and chart container. At the existing mobile breakpoint, change two-column grids to one column and keep table horizontally scrollable. Reuse current colors, borders, typography, buttons and focus treatment.

- [ ] **Step 5: Run frontend regression suite and production build**

Run: `cd frontend && npm test -- --run`

Expected: all frontend tests pass.

Run: `cd frontend && npm run build`

Expected: TypeScript check and Vite production build succeed.

- [ ] **Step 6: Run complete repository verification**

Run: `cd backend && pytest -q`

Expected: all backend tests pass.

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only intentional task files are modified before the final commit.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.tsx frontend/src/App.test.tsx frontend/src/styles.css
git commit -m "feat: integrate portfolio comparison workspace"
```
