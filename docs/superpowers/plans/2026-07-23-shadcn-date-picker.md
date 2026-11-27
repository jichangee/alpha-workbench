# shadcn/ui Date Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all four native date inputs with one reusable shadcn/ui date picker without changing form state or API formats.

**Architecture:** Add the official Radix-based shadcn/ui Calendar and Popover sources, then compose them with the existing Button in a controlled `DatePicker`. The component translates between local `Date` values and the existing `YYYY-MM-DD` strings and leaves all business validation in the two forms.

**Tech Stack:** React 19, TypeScript, Vite, shadcn/ui (Radix), Tailwind CSS 4, React DayPicker, date-fns, Vitest, Testing Library

## Global Constraints

- Keep the two independent start and end fields in each form.
- Preserve existing defaults, validation, CSV visibility, market invalidation, and API request shapes.
- Parse and format calendar dates in local time; do not parse `YYYY-MM-DD` as UTC.
- Start dates may not exceed the selected end date.
- End dates may not precede the selected start date or exceed today.
- Do not modify backend files.

---

### Task 1: Reusable controlled date picker

**Files:**
- Create: `frontend/src/components/ui/calendar.tsx`
- Create: `frontend/src/components/ui/popover.tsx`
- Create: `frontend/src/components/DatePicker.tsx`
- Create: `frontend/src/components/DatePicker.test.tsx`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`

**Interfaces:**
- Consumes: existing `Button` and `cn`; official shadcn/ui `Calendar` and `Popover`.
- Produces: `DatePicker({ id, 'aria-label', value, onChange, min?, max?, className? })`, where date props use `YYYY-MM-DD`.

- [x] **Step 1: Write failing component tests**

Add tests that render:

```tsx
<DatePicker
  id="start"
  aria-label="开始日期"
  value="2021-01-01"
  min="2020-01-01"
  max="2021-01-31"
  onChange={onChange}
/>
```

Assert the trigger shows `2021-01-01`, opens a dialog containing the January 2021 calendar, calls `onChange("2021-01-15")` when day 15 is selected, and exposes out-of-range days as disabled.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd frontend
npm test -- --run src/components/DatePicker.test.tsx
```

Expected: FAIL because `DatePicker` does not exist.

- [x] **Step 3: Add official shadcn/ui primitives**

Run:

```bash
cd frontend
npx shadcn add calendar popover
```

Expected: `calendar.tsx` and `popover.tsx` are added and required dependencies are recorded.

- [x] **Step 4: Implement local date conversion and controlled picker**

Create `DatePicker.tsx` with:

```tsx
interface DatePickerProps {
  id: string
  'aria-label': string
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  className?: string
}
```

Split `YYYY-MM-DD` into numeric year, month, and day for `new Date(year, month - 1, day)`. Serialize selected dates from `getFullYear()`, `getMonth() + 1`, and `getDate()`. Render a controlled `Popover`, an outline `Button` trigger, and a Chinese-locale single-selection `Calendar`; disable dates before `min` or after `max` and close after selection.

- [x] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
cd frontend
npm test -- --run src/components/DatePicker.test.tsx
```

Expected: all DatePicker tests PASS.

### Task 2: Replace both forms and preserve behavior

**Files:**
- Modify: `frontend/src/components/BacktestForm.tsx`
- Modify: `frontend/src/components/BacktestForm.test.tsx`
- Modify: `frontend/src/components/PortfolioComparisonForm.tsx`
- Modify: `frontend/src/components/PortfolioComparisonForm.test.tsx`

**Interfaces:**
- Consumes: Task 1 `DatePicker`.
- Produces: both forms using the date picker while continuing to emit the existing string-valued request objects.

- [x] **Step 1: Update tests for button-based date fields**

Replace native input value assertions with accessible trigger text assertions. Add selection tests that open each relevant trigger, choose another enabled date, and assert the submitted `start` or `end` string changed. Retain the CSV-mode absence assertion and add assertions that invalid boundary dates are disabled.

- [x] **Step 2: Run form tests and verify RED**

Run:

```bash
cd frontend
npm test -- --run src/components/BacktestForm.test.tsx src/components/PortfolioComparisonForm.test.tsx
```

Expected: FAIL because the forms still render native inputs.

- [x] **Step 3: Replace four native inputs**

In `BacktestForm`, replace both `Input type="date"` nodes with `DatePicker`, passing `form.start`, `form.end`, and today's local date as the existing constraints require.

In `PortfolioComparisonForm`, replace both date inputs with `DatePicker`; keep clearing `error` in each `onChange` callback.

- [x] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
cd frontend
npm test -- --run src/components/DatePicker.test.tsx src/components/BacktestForm.test.tsx src/components/PortfolioComparisonForm.test.tsx
```

Expected: all focused tests PASS.

- [x] **Step 5: Run full frontend verification**

Run:

```bash
cd frontend
npm test -- --run
npm run build
```

Expected: the full test suite passes and TypeScript/Vite production build completes successfully.
