from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
import re

import numpy as np
import pandas as pd
import yfinance as yf


REQUIRED = ("Open", "High", "Low", "Close")
CACHE_DIR = Path(__file__).resolve().parent.parent / ".cache" / "market-data"
PRICE_RANGE_RTOL = np.finfo(float).eps * 8


class MarketDataError(ValueError):
    """A market-data problem that is safe to return to API clients."""


def normalize_bars(frame: pd.DataFrame) -> pd.DataFrame:
    """Return daily OHLC bars, retaining the last supplied row for each calendar date."""
    bars = frame.copy()
    bars.columns = [str(column).strip().title() for column in bars.columns]
    if "Date" in bars.columns:
        bars = bars.set_index("Date")
    elif isinstance(bars.index, pd.RangeIndex):
        raise MarketDataError("缺少日期列")

    missing = [column for column in REQUIRED if column not in bars.columns]
    if missing:
        raise MarketDataError(f"缺少必需行情列：{', '.join(missing)}")

    try:
        bars.index = pd.to_datetime(bars.index, errors="raise").tz_localize(None).normalize()
    except (TypeError, ValueError) as error:
        raise MarketDataError("日期格式无效") from error

    bars = bars[~bars.index.duplicated(keep="last")].sort_index()
    if bars.empty:
        raise MarketDataError("行情数据不能为空")
    try:
        bars.loc[:, REQUIRED] = bars.loc[:, REQUIRED].apply(pd.to_numeric, errors="raise")
    except (TypeError, ValueError) as error:
        raise MarketDataError("行情价格必须是数字") from error

    prices = bars.loc[:, REQUIRED]
    if prices.isna().any().any() or not np.isfinite(prices.to_numpy(dtype=float)).all():
        raise MarketDataError("行情价格必须是数字")
    if (prices <= 0).any().any():
        raise MarketDataError("行情价格必须大于 0")
    if (bars["High"] < bars["Low"]).any():
        raise MarketDataError("最高价必须不低于最低价")
    if _outside_price_range(bars["Open"], bars["Low"], bars["High"]).any():
        raise MarketDataError("开盘价必须位于最高价和最低价之间")
    if _outside_price_range(bars["Close"], bars["Low"], bars["High"]).any():
        raise MarketDataError("收盘价必须位于最高价和最低价之间")

    bars["Open"] = bars["Open"].clip(lower=bars["Low"], upper=bars["High"])
    bars["Close"] = bars["Close"].clip(lower=bars["Low"], upper=bars["High"])
    return bars


def _outside_price_range(
    price: pd.Series, low: pd.Series, high: pd.Series
) -> pd.Series:
    below = (price < low) & ~np.isclose(
        price, low, rtol=PRICE_RANGE_RTOL, atol=0
    )
    above = (price > high) & ~np.isclose(
        price, high, rtol=PRICE_RANGE_RTOL, atol=0
    )
    return below | above


def load_yahoo(symbol: str, start: date, end: date) -> pd.DataFrame:
    """Load adjusted daily Yahoo bars, returning a cached result when available."""
    normalized_symbol = symbol.strip().upper()
    cache_path = _cache_path(normalized_symbol, start, end)
    if cache_path.exists():
        try:
            return pd.read_pickle(cache_path)
        except (OSError, ValueError, TypeError):
            cache_path.unlink(missing_ok=True)

    try:
        frame = yf.download(
            normalized_symbol,
            start=start,
            end=end + timedelta(days=1),
            interval="1d",
            auto_adjust=True,
            progress=False,
        )
    except Exception as error:
        raise MarketDataError("无法下载行情数据，请检查股票代码、日期范围或网络连接") from error

    if frame.empty:
        raise MarketDataError("未获取到行情数据，请检查股票代码、日期范围或网络连接")
    if isinstance(frame.columns, pd.MultiIndex):
        symbols = frame.columns.get_level_values(-1).unique()
        if len(symbols) != 1:
            raise MarketDataError("一次只能下载一个股票代码的行情数据")
        frame = frame.copy()
        frame.columns = frame.columns.get_level_values(0)

    bars = normalize_bars(frame)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    bars.to_pickle(cache_path)
    return bars


def _cache_path(symbol: str, start: date, end: date) -> Path:
    safe_symbol = re.sub(r"[^A-Z0-9._-]+", "_", symbol)
    return CACHE_DIR / f"{safe_symbol}_{start.isoformat()}_{end.isoformat()}.pkl"
