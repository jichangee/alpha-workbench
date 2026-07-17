from __future__ import annotations

from dataclasses import dataclass
from math import isfinite, sqrt

import numpy as np
import pandas as pd

from .engine import Trade


class MetricsError(ValueError):
    """An invalid performance-metrics input."""


@dataclass(frozen=True)
class Metrics:
    ending_equity: float
    total_return: float | None
    cagr: float | None
    annualized_volatility: float | None
    sharpe_ratio: float | None
    max_drawdown: float
    trade_count: int
    win_rate: float | None


def calculate_metrics(
    equity: pd.Series, trades: list[Trade], initial_cash: float
) -> Metrics:
    """Calculate daily performance statistics using 252 sessions per year."""
    _validate_inputs(equity, initial_cash)
    values = equity.astype("float64")
    initial_cash = float(initial_cash)
    ending_equity = float(values.iloc[-1])
    growth_ratio = _finite_or_none(ending_equity / initial_cash)
    total_return = _finite_or_none(growth_ratio - 1) if growth_ratio is not None else None
    periods = len(values) - 1
    cagr = _calculate_cagr(growth_ratio, periods)

    daily_returns = values.pct_change(fill_method=None).dropna()
    if len(daily_returns) < 2:
        annualized_volatility = None
        sharpe_ratio = None
    else:
        daily_std = float(daily_returns.std(ddof=1))
        annualized_volatility = _finite_or_none(daily_std * sqrt(252))
        if abs(daily_std) <= 1e-15:
            sharpe_ratio = None
        else:
            sharpe_ratio = _finite_or_none(
                float(daily_returns.mean()) / daily_std * sqrt(252)
            )

    drawdown = values / values.cummax() - 1
    max_drawdown = float(drawdown.min())
    closed_trades = [trade for trade in trades if trade.exit_date is not None]
    win_rate = (
        sum(trade.net_pnl is not None and trade.net_pnl > 0 for trade in closed_trades)
        / len(closed_trades)
        if closed_trades
        else None
    )

    return Metrics(
        ending_equity=ending_equity,
        total_return=total_return,
        cagr=cagr,
        annualized_volatility=annualized_volatility,
        sharpe_ratio=sharpe_ratio,
        max_drawdown=max_drawdown,
        trade_count=len(closed_trades),
        win_rate=win_rate,
    )


def _validate_inputs(equity: pd.Series, initial_cash: float) -> None:
    if equity.empty:
        raise MetricsError("净值序列不能为空")
    try:
        values = equity.to_numpy(dtype=float)
    except (TypeError, ValueError) as error:
        raise MetricsError("净值必须是有限正数") from error
    if not np.isfinite(values).all() or float(values[0]) <= 0:
        raise MetricsError("净值必须是有限数，且首个值必须为正数")
    if isinstance(initial_cash, bool):
        raise MetricsError("初始资金必须是有限正数")
    try:
        valid_initial_cash = isfinite(float(initial_cash)) and float(initial_cash) > 0
    except (TypeError, ValueError):
        valid_initial_cash = False
    if not valid_initial_cash:
        raise MetricsError("初始资金必须是有限正数")


def _finite_or_none(value: float) -> float | None:
    return float(value) if isfinite(value) else None


def _calculate_cagr(growth_ratio: float | None, periods: int) -> float | None:
    if not periods or growth_ratio is None or growth_ratio <= 0:
        return None
    try:
        return _finite_or_none(growth_ratio ** (252 / periods) - 1)
    except OverflowError:
        return None
