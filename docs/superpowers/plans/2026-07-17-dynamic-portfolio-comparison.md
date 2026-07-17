# 动态新增持仓对比 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将固定两组持仓对比升级为可在页面动态增加和删除、同时比较 2 至 5 组持仓。

**Architecture:** 保持现有 API 形状和买入持有计算服务，只放宽 Pydantic 数量约束并将前端二元元组改为数组。表单使用稳定持仓 ID 管理增删，结果摘要、指标表和 ECharts 曲线全部按响应数组动态渲染。

**Tech Stack:** Python 3.11、FastAPI、Pydantic 2、Pytest；React 19、TypeScript、Vitest、Testing Library、ECharts 6。

## Global Constraints

- 默认保留现有两组持仓，允许动态比较 2 至 5 组。
- 新持仓默认一只空代码股票、权重 100%，名称按未使用顺序生成。
- 可以删除任意持仓，但不得少于两组；达到五组时不得继续新增。
- 所有持仓继续按全部股票的共同交易日、首日配置后不再平衡。
- 请求取消、行情去重下载、每组权重和股票校验保持不变。
- 结果摘要、指标列和曲线必须覆盖响应中的每一组持仓。

---

### Task 1: 放宽后端和 TypeScript 数量契约

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/tests/test_portfolio_comparison.py`
- Modify: `backend/tests/test_portfolio_comparison_api.py`
- Modify: `frontend/src/types.ts`

**Interfaces:**
- Consumes: 现有 `PortfolioComparisonRequest` 与 `PortfolioComparisonResponse`。
- Produces: 后端接受 2–5 个 `PortfolioDefinition`，前端 `portfolios` 为普通数组。

- [ ] **Step 1: Write failing backend contract tests**

```python
def test_accepts_five_portfolios():
    payload = request_payload()
    payload["portfolios"].extend([
        {"name": f"持仓 {index}", "positions": [{"symbol": f"S{index}", "weight": 1}]}
        for index in range(3, 6)
    ])
    assert len(PortfolioComparisonRequest.model_validate(payload).portfolios) == 5

def test_rejects_six_portfolios():
    payload = request_payload()
    payload["portfolios"].extend([
        {"name": f"持仓 {index}", "positions": [{"symbol": f"S{index}", "weight": 1}]}
        for index in range(3, 7)
    ])
    with pytest.raises(ValidationError, match="at most 5"):
        PortfolioComparisonRequest.model_validate(payload)
```

Extend the API success fixture with a third portfolio reusing `VOO`, and assert the response has three portfolios while Yahoo is still called once per unique symbol.

- [ ] **Step 2: Run and verify RED**

Run: `.venv/bin/pytest backend/tests/test_portfolio_comparison.py backend/tests/test_portfolio_comparison_api.py -q`

Expected: five-group validation fails because the current maximum is two.

- [ ] **Step 3: Implement the contract change**

Change the schema constraint to:

```python
portfolios: list[PortfolioDefinition] = Field(min_length=2, max_length=5)
```

Change the TypeScript contracts to:

```ts
export interface PortfolioComparisonInput {
  start: string
  end: string
  portfolios: PortfolioDefinitionInput[]
}

export interface PortfolioComparisonResponse {
  start: string
  end: string
  dates: string[]
  portfolios: PortfolioComparisonSeries[]
}
```

- [ ] **Step 4: Run and verify GREEN**

Run: `.venv/bin/pytest backend/tests/test_portfolio_comparison.py backend/tests/test_portfolio_comparison_api.py -q`

Expected: all focused backend tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas.py backend/tests/test_portfolio_comparison.py backend/tests/test_portfolio_comparison_api.py frontend/src/types.ts
git commit -m "feat: support up to five portfolio comparisons"
```

### Task 2: Dynamic portfolio form

**Files:**
- Modify: `frontend/src/components/PortfolioComparisonForm.tsx`
- Modify: `frontend/src/components/PortfolioComparisonForm.test.tsx`
- Modify: `frontend/src/api.test.ts`

**Interfaces:**
- Consumes: Task 1 array-based `PortfolioComparisonInput.portfolios`。
- Produces: “新增持仓”和“删除此持仓”交互，提交全部 2–5 个持仓。

- [ ] **Step 1: Write failing interaction tests**

```tsx
it('adds a third 100% portfolio and submits it', async () => {
  const onCompare = vi.fn()
  render(<PortfolioComparisonForm onCompare={onCompare} running={false} />)
  await userEvent.click(screen.getByRole('button', { name: '新增持仓' }))
  expect(screen.getByLabelText('持仓 3 名称')).toHaveValue('持仓 3')
  expect(screen.getByLabelText('持仓 3 第 1 只股票权重')).toHaveValue(100)
  await userEvent.type(screen.getByLabelText('持仓 3 第 1 只股票代码'), 'AAPL')
  await userEvent.click(screen.getByRole('button', { name: '开始对比' }))
  expect(onCompare.mock.calls[0][0].portfolios).toHaveLength(3)
})
```

Add tests that two groups disable deletion, deletion of the middle of three preserves the other symbols, and five groups disable “新增持仓”.

- [ ] **Step 2: Run and verify RED**

Run: `cd frontend && npm test -- --run src/components/PortfolioComparisonForm.test.tsx src/api.test.ts`

Expected: “新增持仓” is absent and three-group payload cannot be represented by the current tuple type.

- [ ] **Step 3: Implement stable portfolio drafts**

Add `id` to `PortfolioDraft`, plus `nextPortfolioId` and `nextPortfolioNumber` refs. Implement:

```ts
const addPortfolio = () => {
  if (portfolios.length >= 5) return
  const portfolioNumber = nextPortfolioNumber.current++
  setPortfolios((current) => [...current, {
    id: nextPortfolioId.current++,
    name: `持仓 ${portfolioNumber}`,
    positions: [{ id: nextPositionId.current++, symbol: '', weight: '100' }],
  }])
}

const removePortfolio = (portfolioId: number) => {
  setPortfolios((current) => current.length <= 2
    ? current
    : current.filter((portfolio) => portfolio.id !== portfolioId))
}
```

Use `portfolio.id` as the React key. Submit `portfolios: normalized` without truncating it. Render the group count, delete control and maximum-state copy.

- [ ] **Step 4: Run and verify GREEN**

Run: `cd frontend && npm test -- --run src/components/PortfolioComparisonForm.test.tsx src/api.test.ts`

Expected: focused form and API tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PortfolioComparisonForm.tsx frontend/src/components/PortfolioComparisonForm.test.tsx frontend/src/api.test.ts
git commit -m "feat: add dynamic portfolio editors"
```

### Task 3: Multi-portfolio results and final verification

**Files:**
- Modify: `frontend/src/components/PortfolioComparisonChart.tsx`
- Modify: `frontend/src/components/PortfolioComparisonResults.tsx`
- Modify: `frontend/src/components/PortfolioComparisonResults.test.tsx`
- Modify: `frontend/src/portfolioComparisonFixture.ts`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes: Task 1 array response containing 2–5 portfolios。
- Produces: 2–5 summary cards, metric columns and visually distinct ECharts lines。

- [ ] **Step 1: Write failing third-portfolio result test**

```tsx
it('renders a third portfolio in summaries and metric columns', () => {
  render(<PortfolioComparisonResults result={threePortfolioFixture} />)
  expect(screen.getByText('持仓 3')).toBeVisible()
  expect(screen.getByText('AAPL 100%')).toBeVisible()
  expect(screen.getByRole('columnheader', { name: '持仓 3' })).toBeVisible()
  expect(screen.getByText(/各组起点均为 100/)).toBeVisible()
})
```

- [ ] **Step 2: Run and verify RED**

Run: `cd frontend && npm test -- --run src/components/PortfolioComparisonResults.test.tsx`

Expected: fixture typing or fixed two-group copy/chart assumptions fail.

- [ ] **Step 3: Generalize chart presentation**

Use a five-color palette and line-style palette indexed modulo their lengths. Build the accessible chart label from all portfolio names joined with `、`; change explanatory copy to “各组起点均为 100”。Add CSS tones 3–5 while keeping the existing responsive grid and horizontal table scrolling.

- [ ] **Step 4: Run full verification**

Run: `.venv/bin/pytest -q`

Expected: all backend tests pass.

Run: `cd frontend && npm test -- --run`

Expected: all frontend tests pass.

Run: `cd frontend && npm run build`

Expected: TypeScript and Vite production build pass without chunk-size warning.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PortfolioComparisonChart.tsx frontend/src/components/PortfolioComparisonResults.tsx frontend/src/components/PortfolioComparisonResults.test.tsx frontend/src/portfolioComparisonFixture.ts frontend/src/styles.css
git commit -m "feat: render multi-portfolio comparisons"
```
