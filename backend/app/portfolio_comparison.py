from math import isfinite, sqrt

import numpy as np
import pandas as pd

from .schemas import (
    PortfolioComparisonMetrics,
    PortfolioComparisonRequest,
    PortfolioComparisonResponse,
    PortfolioComparisonSeries,
)


class PortfolioComparisonError(ValueError):
    """Raised when supplied histories cannot support a fair comparison."""


def calculate_portfolio_comparison(
    request: PortfolioComparisonRequest,
    bars_by_symbol: dict[str, pd.DataFrame],
) -> PortfolioComparisonResponse:
    symbols = list(
        dict.fromkeys(
            position.symbol
            for portfolio in request.portfolios
            for position in portfolio.positions
        )
    )
    closes = _aligned_closes(symbols, bars_by_symbol)
    dates = [timestamp.date() for timestamp in closes.index]
    series = [
        _calculate_portfolio(portfolio, closes)
        for portfolio in request.portfolios
    ]
    return PortfolioComparisonResponse(
        start=dates[0],
        end=dates[-1],
        dates=dates,
        portfolios=series,
    )


def _aligned_closes(
    symbols: list[str], bars_by_symbol: dict[str, pd.DataFrame]
) -> pd.DataFrame:
    columns: dict[str, pd.Series] = {}
    for symbol in symbols:
        bars = bars_by_symbol.get(symbol)
        if bars is None or "Close" not in bars.columns:
            raise PortfolioComparisonError(f"{symbol} 缺少有效的复权收盘价")
        close = pd.to_numeric(bars["Close"], errors="coerce")
        close.index = pd.to_datetime(close.index).tz_localize(None)
        columns[symbol] = close[~close.index.duplicated(keep="last")]

    aligned = pd.concat(columns, axis=1, join="inner").sort_index()
    valid = np.isfinite(aligned).all(axis=1) & (aligned > 0).all(axis=1)
    aligned = aligned.loc[valid]
    if len(aligned) < 2:
        raise PortfolioComparisonError("全部股票至少需要两个共同交易日")
    return aligned.astype(float)


def _period_key(timestamp: pd.Timestamp, frequency: str) -> tuple[int, ...]:
    if frequency == "monthly":
        return (timestamp.year, timestamp.month)
    if frequency == "quarterly":
        return (timestamp.year, (timestamp.month - 1) // 3 + 1)
    if frequency == "yearly":
        return (timestamp.year,)
    return ()


def _portfolio_equity(portfolio, closes: pd.DataFrame) -> tuple[pd.Series, list]:
    symbols = [position.symbol for position in portfolio.positions]
    prices = closes[symbols]
    target_weights = np.asarray(
        [position.weight for position in portfolio.positions],
        dtype=float,
    )
    weights = target_weights.copy()
    values = [100.0]
    rebalance_dates = []

    for offset in range(1, len(prices)):
        relatives = (
            prices.iloc[offset].to_numpy(dtype=float)
            / prices.iloc[offset - 1].to_numpy(dtype=float)
        )
        growth = float(np.dot(weights, relatives))
        values.append(values[-1] * growth)
        weights = weights * relatives / growth

        has_next = offset < len(prices) - 1
        frequency = portfolio.rebalance_frequency
        threshold_reached = np.any(
            np.abs(weights - target_weights) >= portfolio.rebalance_threshold / 100
        )
        if (
            has_next
            and (
                (
                    frequency in {"monthly", "quarterly", "yearly"}
                    and _period_key(prices.index[offset], frequency)
                    != _period_key(prices.index[offset + 1], frequency)
                )
                or (frequency == "threshold" and threshold_reached)
            )
        ):
            weights = target_weights.copy()
            rebalance_dates.append(prices.index[offset].date())

    return pd.Series(values, index=prices.index), rebalance_dates


def _calculate_portfolio(portfolio, closes: pd.DataFrame) -> PortfolioComparisonSeries:
    equity, rebalance_dates = _portfolio_equity(portfolio, closes)

    returns = equity.pct_change().dropna()
    drawdown = equity / equity.cummax() - 1
    elapsed_days = (equity.index[-1] - equity.index[0]).days
    cagr = None
    if elapsed_days > 0:
        cagr = float((equity.iloc[-1] / equity.iloc[0]) ** (365.25 / elapsed_days) - 1)
    volatility = None
    sharpe_ratio = None
    if len(returns) >= 2:
        daily_std = float(returns.std(ddof=1))
        volatility = float(daily_std * sqrt(252))
        if isfinite(daily_std) and daily_std != 0:
            sharpe_ratio = float(returns.mean()) / daily_std * sqrt(252)
    metrics = PortfolioComparisonMetrics(
        total_return=round(float(equity.iloc[-1] / equity.iloc[0] - 1), 12),
        cagr=cagr,
        annualized_volatility=volatility,
        sharpe_ratio=sharpe_ratio,
        max_drawdown=float(drawdown.min()),
    )
    return PortfolioComparisonSeries(
        name=portfolio.name,
        positions=portfolio.positions,
        rebalance_frequency=portfolio.rebalance_frequency,
        rebalance_dates=rebalance_dates,
        rebalance_threshold=portfolio.rebalance_threshold,
        equity=[round(float(value), 10) for value in equity],
        metrics=metrics,
    )
