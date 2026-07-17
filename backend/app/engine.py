from __future__ import annotations

from collections.abc import Callable
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
            benchmark_affordable = _checked(
                "基准可购买股数", lambda: benchmark_cash / open_price
            )
            benchmark_shares = floor(benchmark_affordable)
            benchmark_notional = _checked(
                "基准买入金额", lambda: benchmark_shares * open_price
            )
            benchmark_cash = _checked(
                "基准剩余现金", lambda: benchmark_cash - benchmark_notional
            )

        desired = int(target.iloc[offset - 1]) if offset else 0
        if desired == 1 and shares == 0:
            fill_price = _checked(
                "买入成交价", lambda: open_price * (1 + slippage_rate)
            )
            available_cash = _checked("买入可用现金", lambda: cash - commission)
            affordable = _checked(
                "策略可购买股数", lambda: available_cash / fill_price
            )
            quantity = floor(affordable)
            buy_notional = (
                _checked("买入金额", lambda: quantity * fill_price)
                if quantity > 0
                else 0.0
            )
            buy_cost = _checked("买入总成本", lambda: buy_notional + commission)
            while quantity > 0 and buy_cost > cash:
                quantity -= 1
                buy_notional = _checked("买入金额", lambda: quantity * fill_price)
                buy_cost = _checked("买入总成本", lambda: buy_notional + commission)
            if quantity > 0:
                cash = _zero_small_residue(
                    _checked("买入后现金", lambda: cash - buy_cost)
                )
                shares = quantity
                open_entry = Fill(date, "buy", fill_price, quantity, commission)
                fills.append(open_entry)
            else:
                warnings.append(f"{date.date().isoformat()}：资金不足，买入信号未成交")
        elif desired == 0 and shares > 0:
            fill_price = _checked(
                "卖出成交价", lambda: open_price * (1 - slippage_rate)
            )
            sale_proceeds = _checked("卖出所得", lambda: shares * fill_price)
            cash_and_proceeds = _checked(
                "卖出可用资金", lambda: cash + sale_proceeds
            )
            if cash_and_proceeds + 1e-12 < commission:
                raise EngineError("卖出所得和现金不足以支付佣金")
            cash = _zero_small_residue(
                _checked("卖出后现金", lambda: cash_and_proceeds - commission)
            )
            exit_fill = Fill(date, "sell", fill_price, shares, commission)
            fills.append(exit_fill)
            if open_entry is None:  # Defensive: the state machine always sets this on entry.
                raise RuntimeError("持仓缺少对应的买入成交")
            price_change = _checked(
                "交易价差", lambda: fill_price - open_entry.price
            )
            gross_pnl = _checked("交易毛收益", lambda: price_change * shares)
            costs = _checked(
                "交易成本", lambda: open_entry.commission + commission
            )
            net_pnl = _checked("交易净收益", lambda: gross_pnl - costs)
            entry_notional = _checked(
                "入场金额", lambda: open_entry.price * open_entry.shares
            )
            entry_cost = _checked(
                "入场总成本", lambda: entry_notional + open_entry.commission
            )
            return_pct = _checked("交易收益率", lambda: net_pnl / entry_cost)
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
                    return_pct=return_pct,
                )
            )
            shares = 0
            open_entry = None

        holdings = _checked("持仓市值", lambda: shares * close_price)
        total = _checked("总资产", lambda: cash + holdings)
        benchmark_holdings = _checked(
            "基准持仓市值", lambda: benchmark_shares * close_price
        )
        benchmark_total = _checked(
            "基准总资产", lambda: benchmark_cash + benchmark_holdings
        )
        strategy_value = _checked("策略净值", lambda: total / initial_cash)
        benchmark_value = _checked(
            "基准净值", lambda: benchmark_total / initial_cash
        )
        rows.append(
            {
                "cash": cash,
                "shares": shares,
                "holdings": holdings,
                "total": total,
                "strategy": strategy_value,
                "benchmark": benchmark_value,
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
    with np.errstate(divide="ignore", invalid="ignore", over="ignore"):
        equity["drawdown"] = equity["strategy"] / equity["strategy"].cummax() - 1
        equity["benchmark_drawdown"] = (
            equity["benchmark"] / equity["benchmark"].cummax() - 1
        )
    try:
        finite_equity = np.isfinite(equity.to_numpy(dtype=float)).all()
    except (OverflowError, TypeError, ValueError) as error:
        raise EngineError("净值和回撤超出有限数值范围") from error
    if not finite_equity:
        raise EngineError("净值和回撤超出有限数值范围")
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


def _checked(label: str, operation: Callable[[], float | int]) -> float:
    try:
        value = float(operation())
    except (ArithmeticError, TypeError, ValueError) as error:
        raise EngineError(f"{label}超出有限数值范围") from error
    if not isfinite(value):
        raise EngineError(f"{label}超出有限数值范围")
    return value
