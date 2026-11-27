# Alpha Workbench

[English](./README.md) | **简体中文**

一个基于 Next.js 构建的美股日线策略回测与资产配置研究工作台。支持 Yahoo Finance 在线拉取或本地 CSV 导入行情数据，提供策略回测、卖出换仓、多组合再平衡对比、交互式 ECharts 图表，以及用于 AI Agent 调用的 MCP（Model Context Protocol）服务端点。

- 在线体验：https://alpha-workbench.vercel.app
- 仓库地址：https://github.com/jichangee/alpha-workbench

> 仅供学习、研究与演示，不构成投资建议、交易建议或任何收益承诺。历史回测结果不代表未来表现；使用者应自行核实数据、策略和风险。

## 核心功能

- **单策略回测**：内置 `买入并持有`、`均线交叉`、`RSI 反转`、`唐奇安通道突破` 4 种策略。加载行情后，切换策略、拖动参数滑块或调整交易假设会在防抖后自动刷新结果，并复用已加载行情数据。
- **卖出处理模式**：
  - **卖出后持有现金**：策略卖出主标的后保留现金，等待下一次买入信号。
  - **卖出后换仓**：主策略卖出时换入替代标的，重新出现买入信号时换回主标的（调仓日先卖后买，分别计提佣金与滑点；仅使用两只标的共同存在行情的交易日）。
- **持仓对比与再平衡**：支持同时配置 2–5 组资产组合（每组 1–8 只标的，权重之和须为 100%），各组独立选择不再平衡、每月、每季度、每年或阈值触发再平衡，并在净值图上标注实际再平衡日期。
- **双行情数据源**：支持通过 Yahoo Finance 在线下载美股日线行情，也支持上传本地 CSV 文件离线运行。
- **MCP 服务接入**：提供 `/api/mcp` 端点（Streamable HTTP），暴露 `list_strategies`、`get_market_data`、`run_backtest`、`compare_portfolios` 工具，方便外部 AI 客户端或工作流调用。

## 技术栈

- **框架**：Next.js 16（App Router）、React 19、TypeScript
- **UI 与可视化**：Tailwind CSS v4、shadcn/ui（Radix UI）、Lucide Icons、ECharts
- **数据源与校验**：`yahoo-finance2`、`papaparse`、`zod`
- **MCP**：`@modelcontextprotocol/sdk`
- **测试**：Vitest、Testing Library（jsdom）

## 本地开发

### 前置条件

- Node.js `^20.19.0` 或 `>=22.12.0`
- npm
- 使用 Yahoo Finance 数据时需要网络；使用 CSV 时可离线运行

### 安装与启动

```bash
npm install
npm run dev
```

启动后访问终端提示的本地地址（默认 `http://localhost:3000`）。

### 常用脚本

```bash
npm test          # 运行 Vitest 单元测试与契约测试
npm run typecheck # TypeScript 类型检查（tsc --noEmit）
npm run lint      # ESLint 检查
npm run build     # 生产构建
npm run start     # 启动生产服务
```

## 环境变量与部署

项目支持零配置部署到 Vercel（已连接 `master` 分支自动部署）。

如需为 `/api/mcp` 接口启用鉴权，防止公网部署后被未授权调用，可参考 [.env.example](.env.example) 在本地 `.env.local` 或 Vercel 环境变量中配置：

```bash
MCP_AUTH_TOKEN=your-secret-token
```

配置后，请求 `/api/mcp` 需携带请求头 `Authorization: Bearer <MCP_AUTH_TOKEN>`；未配置时默认不校验。

## 目录结构

```text
src/
├── app/
│   ├── api/
│   │   ├── backtests/             # 单策略回测接口
│   │   ├── health/                # 健康检查接口
│   │   ├── market-data/preview/   # 行情预览与 CSV/Yahoo 解析
│   │   ├── mcp/                   # MCP Server 路由
│   │   ├── portfolio-comparisons/ # 多组合对比接口
│   │   └── strategies/            # 策略目录接口
│   ├── layout.tsx
│   └── page.tsx
├── components/                    # 表单、图表（净值/价格/回撤/组合对比）与 UI 组件
└── lib/
    └── server/                    # 回测引擎、指标计算、行情加载、组合再平衡逻辑
```

> 注：仓库中保留的 `backend/` 与 `frontend/` 为早期 FastAPI + Vite 版本代码，当前生产构建与 Vercel 部署均以根目录 Next.js 应用为准。

## 使用方式

1. 选择 **Yahoo Finance** 或 **CSV**，并设置标的代码与回测日期范围。
2. 点击 **“加载行情并开始回测”** 完成首次回测。
3. 之后可直接切换策略卡片、拖动参数滑块或调整初始资金、佣金、滑点与卖出处理模式，结果会自动刷新。
4. 切换到 **“持仓对比”** 标签页，可配置多组资产权重与再平衡策略进行横向对比。

## CSV 格式要求

CSV 至少包含以下列（列名不区分大小写）：

```csv
Date,Open,High,Low,Close,Volume
2024-01-02,470.10,473.67,468.12,472.65,12345678
```

- 必填：`Date`、`Open`、`High`、`Low`、`Close`
- 可选：`Volume`
- 日期必须可解析，价格必须为有限正数。
- 系统按日期升序排列并去重；最高价不得低于最低价，开盘价和收盘价须位于当日高低价区间内。

## 回测口径与公式

- 策略和买入并持有基准都在第一个交易日开盘建仓；后续策略信号在收盘后确认，于**下一交易日开盘价**成交，避免使用未来信息。
- 初始为空仓，单策略仅交易整数股，不使用融资或杠杆。
- 买入成交价：`开盘价 × (1 + 滑点基点 / 10,000)`；卖出成交价：`开盘价 × (1 - 滑点基点 / 10,000)`。
- 可买股数：`floor((现金 - 单笔佣金) / 买入成交价)`；每次成交扣除固定佣金，资金不足一股时跳过该买入并给出提示。
- 期末未平仓仓位按最后一个交易日收盘价估值，不强制卖出。
- 默认初始资金为 `100,000` 美元，单笔佣金为 `0` 美元，滑点为 `5` 个基点。
- 总收益：`期末资产 / 初始资金 - 1`；年化指标按 `252` 个交易日计算；夏普比率默认无风险利率为 `0`。
- 买入并持有基准不扣除策略设置的交易成本；多组合对比以所有标的共同交易日为准，支持碎股，不计组合再平衡交易成本。
