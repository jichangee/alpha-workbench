from math import sqrt

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


def _calculate_portfolio(portfolio, closes: pd.DataFrame) -> PortfolioComparisonSeries:
    equity = pd.Series(0.0, index=closes.index)
    for position in portfolio.positions:
        normalized = closes[position.symbol] / closes[position.symbol].iloc[0]
        equity = equity + position.weight * normalized
    equity = equity * 100

    returns = equity.pct_change().dropna()
    drawdown = equity / equity.cummax() - 1
    elapsed_days = (equity.index[-1] - equity.index[0]).days
    cagr = None
    if elapsed_days > 0:
        cagr = float((equity.iloc[-1] / equity.iloc[0]) ** (365.25 / elapsed_days) - 1)
    volatility = (
        float(returns.std(ddof=1) * sqrt(252)) if len(returns) >= 2 else None
    )
    metrics = PortfolioComparisonMetrics(
        total_return=round(float(equity.iloc[-1] / equity.iloc[0] - 1), 12),
        cagr=cagr,
        annualized_volatility=volatility,
        max_drawdown=float(drawdown.min()),
    )
    return PortfolioComparisonSeries(
        name=portfolio.name,
        positions=portfolio.positions,
        equity=[round(float(value), 10) for value in equity],
        metrics=metrics,
    )
