from __future__ import annotations

from dataclasses import dataclass
from math import floor, isfinite
from typing import Literal

import numpy as np
import pandas as pd


class EngineError(ValueError):
    """An invalid execution-engine input."""


@dataclass(frozen=True)
class Fill:
    date: pd.Timestamp
    side: Literal["buy", "sell"]
    price: float
    shares: int
    commission: float

    @property
    def notional(self) -> float:
        return self.price * self.shares


@dataclass(frozen=True)
class Trade:
    entry_date: pd.Timestamp
    entry_price: float
    shares: int
    exit_date: pd.Timestamp | None
    exit_price: float | None
    gross_pnl: float | None
    costs: float
    net_pnl: float | None
    return_pct: float | None

    @property
    def is_open(self) -> bool:
        return self.exit_date is None


@dataclass(frozen=True)
class EngineResult:
    equity: pd.DataFrame
    fills: list[Fill]
    trades: list[Trade]
    warnings: list[str]


def run_engine(
    bars: pd.DataFrame,
    target: pd.Series,
    initial_cash: float,
    commission: float,
    slippage_bps: float,
) -> EngineResult:
    """Execute prior-close long/flat targets at the next session's open."""
    _validate_inputs(bars, target, initial_cash, commission, slippage_bps)

    initial_cash = float(initial_cash)
    commission = float(commission)
    slippage_rate = float(slippage_bps) / 10_000
    cash = initial_cash
    shares = 0
    fills: list[Fill] = []
    trades: list[Trade] = []
    warnings: list[str] = []
    open_entry: Fill | None = None

    benchmark_cash = initial_cash
    benchmark_shares = 0
    rows: list[dict[str, float | int]] = []

    for offset, (raw_date, bar) in enumerate(bars.iterrows()):
        date = pd.Timestamp(raw_date)
        open_price = float(bar["Open"])
        close_price = float(bar["Close"])

        if offset == 1:
            benchmark_shares = floor(benchmark_cash / open_price)
            benchmark_cash -= benchmark_shares * open_price

        desired = int(target.iloc[offset - 1]) if offset else 0
        if desired == 1 and shares == 0:
            fill_price = open_price * (1 + slippage_rate)
            quantity = floor((cash - commission) / fill_price)
            while quantity > 0 and quantity * fill_price + commission > cash:
                quantity -= 1
            if quantity > 0:
                buy_cost = quantity * fill_price + commission
                cash = _zero_small_residue(cash - buy_cost)
                shares = quantity
                open_entry = Fill(date, "buy", fill_price, quantity, commission)
                fills.append(open_entry)
            else:
                warnings.append(f"{date.date().isoformat()}：资金不足，买入信号未成交")
        elif desired == 0 and shares > 0:
            fill_price = open_price * (1 - slippage_rate)
            sale_proceeds = shares * fill_price
            if cash + sale_proceeds + 1e-12 < commission:
                raise EngineError("卖出所得和现金不足以支付佣金")
            cash = _zero_small_residue(cash + sale_proceeds - commission)
            exit_fill = Fill(date, "sell", fill_price, shares, commission)
            fills.append(exit_fill)
            if open_entry is None:  # Defensive: the state machine always sets this on entry.
                raise RuntimeError("持仓缺少对应的买入成交")
            gross_pnl = (fill_price - open_entry.price) * shares
            costs = open_entry.commission + commission
            net_pnl = gross_pnl - costs
            entry_cost = open_entry.notional + open_entry.commission
            trades.append(
                Trade(
                    entry_date=open_entry.date,
                    entry_price=open_entry.price,
                    shares=shares,
                    exit_date=date,
                    exit_price=fill_price,
                    gross_pnl=gross_pnl,
                    costs=costs,
                    net_pnl=net_pnl,
                    return_pct=net_pnl / entry_cost,
                )
            )
            shares = 0
            open_entry = None

        holdings = shares * close_price
        total = cash + holdings
        benchmark_total = benchmark_cash + benchmark_shares * close_price
        rows.append(
            {
                "cash": cash,
                "shares": shares,
                "holdings": holdings,
                "total": total,
                "strategy": total / initial_cash,
                "benchmark": benchmark_total / initial_cash,
            }
        )

    if shares > 0:
        if open_entry is None:
            raise RuntimeError("持仓缺少对应的买入成交")
        trades.append(
            Trade(
                entry_date=open_entry.date,
                entry_price=open_entry.price,
                shares=shares,
                exit_date=None,
                exit_price=None,
                gross_pnl=None,
                costs=open_entry.commission,
                net_pnl=None,
                return_pct=None,
            )
        )

    equity = pd.DataFrame(rows, index=bars.index)
    equity["drawdown"] = equity["strategy"] / equity["strategy"].cummax() - 1
    equity["benchmark_drawdown"] = (
        equity["benchmark"] / equity["benchmark"].cummax() - 1
    )
    return EngineResult(equity, fills, trades, warnings)


def _validate_inputs(
    bars: pd.DataFrame,
    target: pd.Series,
    initial_cash: float,
    commission: float,
    slippage_bps: float,
) -> None:
    if bars.empty:
        raise EngineError("行情数据不能为空")
    missing = [column for column in ("Open", "Close") if column not in bars.columns]
    if missing:
        raise EngineError(f"行情缺少必需列：{', '.join(missing)}")
    prices = bars.loc[:, ["Open", "Close"]].to_numpy(dtype=float)
    if not np.isfinite(prices).all() or (prices <= 0).any():
        raise EngineError("开盘价和收盘价必须是有限正数")
    if not target.index.equals(bars.index):
        raise EngineError("目标持仓必须与行情日期完全对齐")
    if target.isna().any() or not target.isin([0, 1]).all():
        raise EngineError("目标持仓只能为 0 或 1")
    if not _is_finite_number(initial_cash) or float(initial_cash) <= 0:
        raise EngineError("初始资金必须是有限正数")
    if not _is_finite_number(commission) or float(commission) < 0:
        raise EngineError("佣金必须是有限非负数")
    if (
        not _is_finite_number(slippage_bps)
        or float(slippage_bps) < 0
        or float(slippage_bps) >= 10_000
    ):
        raise EngineError("滑点基点必须在 0（含）到 10000（不含）之间")


def _is_finite_number(value: object) -> bool:
    if isinstance(value, bool):
        return False
    try:
        return isfinite(float(value))
    except (TypeError, ValueError):
        return False


def _zero_small_residue(value: float) -> float:
    return 0.0 if abs(value) < 1e-12 else value
