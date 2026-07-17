from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import date, datetime
from math import isfinite
from typing import Any

import numpy as np
import pandas as pd

from .engine import EngineResult
from .metrics import Metrics
from .schemas import (
    BacktestFill,
    BacktestMetadata,
    BacktestMetrics,
    BacktestRequest,
    BacktestResponse,
    BacktestSeries,
    BacktestTrade,
)
from .strategies import StrategyOutput


def json_safe(value: Any) -> Any:
    """Convert pandas/NumPy values into JSON-safe Python values recursively."""
    if value is pd.NaT or value is pd.NA:
        return None
    if isinstance(value, np.generic):
        return json_safe(value.item())
    if isinstance(value, pd.Timestamp):
        return value.date()
    if isinstance(value, (datetime, date)):
        return value
    if isinstance(value, float):
        return value if isfinite(value) else None
    if value is None or isinstance(value, (str, int, bool)):
        return value
    if isinstance(value, Mapping):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [json_safe(item) for item in value]
    if pd.isna(value):
        return None
    return value


def serialize_backtest(
    dataset_id: str,
    request: BacktestRequest,
    bars: pd.DataFrame,
    signals: StrategyOutput,
    engine: EngineResult,
    metrics: Metrics,
) -> BacktestResponse:
    """Build the public response without leaking pandas, NumPy, NaN, or Infinity."""
    equity = engine.equity
    return BacktestResponse(
        metadata=BacktestMetadata(
            dataset_id=dataset_id,
            strategy_key=request.strategy.key,
            start=pd.Timestamp(bars.index[0]).date(),
            end=pd.Timestamp(bars.index[-1]).date(),
            execution="next_open",
            warmup=signals.warmup,
            initial_cash=json_safe(request.initialCash),
            commission=json_safe(request.commission),
            slippage_bps=json_safe(request.slippageBps),
        ),
        metrics=BacktestMetrics(
            ending_equity=json_safe(metrics.ending_equity),
            total_return=json_safe(metrics.total_return),
            cagr=json_safe(metrics.cagr),
            annualized_volatility=json_safe(metrics.annualized_volatility),
            sharpe_ratio=json_safe(metrics.sharpe_ratio),
            max_drawdown=json_safe(metrics.max_drawdown),
            trade_count=json_safe(metrics.trade_count),
            win_rate=json_safe(metrics.win_rate),
        ),
        series=BacktestSeries(
            dates=[json_safe(pd.Timestamp(index)) for index in bars.index],
            open=_series_values(bars["Open"]),
            high=_series_values(bars["High"]),
            low=_series_values(bars["Low"]),
            close=_series_values(bars["Close"]),
            cash=_series_values(equity["cash"]),
            shares=_series_values(equity["shares"]),
            holdings=_series_values(equity["holdings"]),
            equity=_series_values(equity["total"]),
            strategy=_series_values(equity["strategy"]),
            benchmark=_series_values(equity["benchmark"]),
            drawdown=_series_values(equity["drawdown"]),
            benchmark_drawdown=_series_values(equity["benchmark_drawdown"]),
        ),
        indicators={name: _series_values(values) for name, values in signals.indicators.items()},
        fills=[
            BacktestFill(
                date=json_safe(fill.date),
                side=fill.side,
                price=json_safe(fill.price),
                shares=json_safe(fill.shares),
                commission=json_safe(fill.commission),
                notional=json_safe(fill.notional),
            )
            for fill in engine.fills
        ],
        trades=[
            BacktestTrade(
                entry_date=json_safe(trade.entry_date),
                entry_price=json_safe(trade.entry_price),
                shares=json_safe(trade.shares),
                exit_date=json_safe(trade.exit_date),
                exit_price=json_safe(trade.exit_price),
                gross_pnl=json_safe(trade.gross_pnl),
                costs=json_safe(trade.costs),
                net_pnl=json_safe(trade.net_pnl),
                return_pct=json_safe(trade.return_pct),
                is_open=trade.is_open,
            )
            for trade in engine.trades
        ],
        warnings=[str(warning) for warning in engine.warnings],
    )


def _series_values(series: pd.Series) -> list[Any]:
    return [json_safe(value) for value in series.tolist()]
