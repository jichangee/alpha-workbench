# Alpha Workbench

**English** | [简体中文](./README.zh-CN.md)

A US equity daily strategy backtesting and portfolio allocation workbench built with Next.js. It supports fetching historical daily bars from Yahoo Finance or importing local CSV files, and provides single-strategy backtesting, cash/rotation sell handling, multi-portfolio rebalancing comparison, interactive ECharts visualizations, and an MCP (Model Context Protocol) server endpoint for AI agents.

- Live Demo: https://alpha-workbench.vercel.app
- Repository: https://github.com/jichangee/alpha-workbench

> For educational, research, and demonstration purposes only. Nothing in this project constitutes investment advice, trading advice, or any guarantee of returns. Historical backtest results do not represent future performance; users are responsible for verifying data, strategies, and risks.

## Features

- **Single-Strategy Backtesting**: Includes 4 built-in strategies (`Buy & Hold`, `SMA Crossover`, `RSI Reversal`, and `Donchian Channel Breakout`). Once market data is loaded, switching strategies, dragging parameter sliders, or adjusting trading assumptions automatically refreshes results with debouncing while reusing the loaded dataset.
- **Sell Position Modes**:
  - **Hold Cash**: Holds cash after the strategy exits the primary symbol until the next buy signal.
  - **Rotate to Alternate**: Rotates into an alternate symbol when the primary strategy exits, and rotates back on the next buy signal (sells first then buys on the rotation day, charging commission and slippage on both legs; runs on common trading days of both symbols).
- **Portfolio Comparison & Rebalancing**: Compare 2–5 portfolios side by side (1–8 symbols per portfolio, weights summing to 100%) with independent rebalancing schedules (`none`, `monthly`, `quarterly`, `yearly`, or `threshold`) and actual rebalance markers plotted on the equity chart.
- **Dual Market Data Sources**: Fetch daily US stock data from Yahoo Finance online, or upload local CSV files to run offline.
- **MCP Server Integration**: Exposes `/api/mcp` (Streamable HTTP) with `list_strategies`, `get_market_data`, `run_backtest`, and `compare_portfolios` tools for external AI clients and workflows.

## Tech Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript
- **UI & Visualization**: Tailwind CSS v4, shadcn/ui (Radix UI), Lucide Icons, ECharts
- **Data & Validation**: `yahoo-finance2`, `papaparse`, `zod`
- **MCP**: `@modelcontextprotocol/sdk`
- **Testing**: Vitest, Testing Library (jsdom)

## Local Development

### Prerequisites

- Node.js `^20.19.0` or `>=22.12.0`
- npm
- Network access when using Yahoo Finance; CSV mode works offline

### Setup & Run

```bash
npm install
npm run dev
```

Open the local URL printed in the terminal (default `http://localhost:3000`).

### Scripts

```bash
npm test          # Run Vitest unit and contract tests
npm run typecheck # Run TypeScript type checking (tsc --noEmit)
npm run lint      # Run ESLint
npm run build     # Build for production
npm run start     # Start production server
```

## Environment Variables & Deployment

The project supports zero-config deployment on Vercel (connected to the `master` branch for automatic deployments).

To protect `/api/mcp` from unauthorized public access, set `MCP_AUTH_TOKEN` in `.env.local` or your Vercel project environment variables (see [.env.example](.env.example)):

```bash
MCP_AUTH_TOKEN=your-secret-token
```

When configured, requests to `/api/mcp` must include `Authorization: Bearer <MCP_AUTH_TOKEN>`. When unset, authentication is skipped.

## Project Structure

```text
src/
├── app/
│   ├── api/
│   │   ├── backtests/             # Single-strategy backtest endpoint
│   │   ├── health/                # Health check endpoint
│   │   ├── market-data/preview/   # Market data preview & CSV/Yahoo parsing
│   │   ├── mcp/                   # MCP Server route
│   │   ├── portfolio-comparisons/ # Multi-portfolio comparison endpoint
│   │   └── strategies/            # Strategy catalog endpoint
│   ├── layout.tsx
│   └── page.tsx
├── components/                    # Forms, charts (equity/price/drawdown/comparison), and UI components
└── lib/
    └── server/                    # Backtest engine, metrics, market data loader, portfolio rebalancing
```

> Note: `backend/` and `frontend/` are legacy FastAPI + Vite directories kept in the repository; the current production build and Vercel deployment run exclusively from the root Next.js app.

## Usage

1. Choose **Yahoo Finance** or **CSV**, and set the ticker symbol(s) and date range.
2. Click **"Load Data & Run Backtest"** to run the initial backtest.
3. Switch strategy cards, adjust parameter sliders, or update initial capital, commission, slippage, and sell position mode — results refresh automatically.
4. Switch to the **"Portfolio Comparison"** tab to configure multiple asset allocations and rebalancing frequencies.

## CSV Format

CSV files must contain at least the following columns (case-insensitive):

```csv
Date,Open,High,Low,Close,Volume
2024-01-02,470.10,473.67,468.12,472.65,12345678
```

- Required: `Date`, `Open`, `High`, `Low`, `Close`
- Optional: `Volume`
- Dates must be parseable and prices must be finite positive numbers.
- Rows are sorted ascending by date and deduplicated; `High >= Low`, and both `Open` and `Close` must fall within `[Low, High]`.

## Backtest Methodology & Formulas

- Both the strategy and the Buy & Hold benchmark enter on the first trading day's open; subsequent strategy signals are confirmed at market close and executed at the **next trading day's open** to prevent look-ahead bias.
- Starts with 0 shares, trades whole shares only in single-strategy mode, and uses no margin or leverage.
- Buy fill price: `Open × (1 + slippage_bps / 10,000)`; Sell fill price: `Open × (1 - slippage_bps / 10,000)`.
- Purchasable shares: `floor((cash - commission) / buy_fill_price)`; fixed commission is deducted per trade, and buys are skipped with a notice if cash is insufficient for 1 share.
- Open positions at the end of the period are marked to market at the final trading day's close without forced liquidation.
- Defaults: `$100,000` initial capital, `$0` commission per trade, `5` bps slippage.
- Total return: `ending_equity / initial_capital - 1`; annualized metrics use `252` trading days per year; Sharpe ratio assumes a `0` risk-free rate.
- The Buy & Hold benchmark excludes strategy trading costs; portfolio comparisons align on common trading days across all assets, support fractional shares, and exclude rebalancing transaction costs.
