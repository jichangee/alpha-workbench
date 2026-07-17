from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import pandas as pd

from .schemas import StrategyConfig


class StrategyError(ValueError):
    """A strategy configuration error that is safe to show to a user."""


@dataclass(frozen=True)
class StrategyOutput:
    target: pd.Series
    indicators: dict[str, pd.Series]
    warmup: int


def _target_from_events(index: pd.Index, buy: pd.Series, sell: pd.Series) -> pd.Series:
    target = pd.Series(0, index=index, dtype="int64")
    position = 0
    for offset in range(len(target)):
        if bool(buy.iloc[offset]):
            position = 1
        elif bool(sell.iloc[offset]):
            position = 0
        target.iloc[offset] = position
    return target


def _integer_parameter(params: dict[str, float | int], key: str, label: str) -> int:
    value = params.get(key)
    if isinstance(value, bool) or not isinstance(value, int):
        raise StrategyError(f"{label}必须为整数")
    return value


def _within(value: int, label: str, minimum: int, maximum: int) -> None:
    if not minimum <= value <= maximum:
        raise StrategyError(f"{label}必须在 {minimum} 到 {maximum} 之间")


def _wilder_average(values: pd.Series, period: int) -> pd.Series:
    average = pd.Series(float("nan"), index=values.index, dtype="float64")
    if len(values) <= period:
        return average

    previous = float(values.iloc[1 : period + 1].mean())
    average.iloc[period] = previous
    for offset in range(period + 1, len(values)):
        previous = ((period - 1) * previous + float(values.iloc[offset])) / period
        average.iloc[offset] = previous
    return average


def buy_hold(bars: pd.DataFrame, _params: dict[str, float | int]) -> StrategyOutput:
    target = pd.Series(1, index=bars.index, dtype="int64")
    return StrategyOutput(target=target, indicators={}, warmup=0)


def sma_cross(bars: pd.DataFrame, params: dict[str, float | int]) -> StrategyOutput:
    short_window = _integer_parameter(params, "short_window", "短均线周期")
    long_window = _integer_parameter(params, "long_window", "长均线周期")
    if short_window >= long_window:
        raise StrategyError("短均线周期必须小于长均线周期")
    _within(short_window, "短均线周期", 2, 200)
    _within(long_window, "长均线周期", 3, 400)

    short_sma = bars["Close"].rolling(short_window).mean()
    long_sma = bars["Close"].rolling(long_window).mean()
    previous_short = short_sma.shift(1)
    previous_long = long_sma.shift(1)
    buy = (previous_short <= previous_long) & (short_sma > long_sma)
    sell = (previous_short >= previous_long) & (short_sma < long_sma)
    return StrategyOutput(
        target=_target_from_events(bars.index, buy, sell),
        indicators={"short_sma": short_sma, "long_sma": long_sma},
        warmup=long_window,
    )


def rsi_reversal(bars: pd.DataFrame, params: dict[str, float | int]) -> StrategyOutput:
    period = _integer_parameter(params, "period", "RSI 周期")
    oversold = _integer_parameter(params, "oversold", "超卖阈值")
    overbought = _integer_parameter(params, "overbought", "超买阈值")
    if oversold >= overbought:
        raise StrategyError("超卖阈值必须小于超买阈值")
    _within(period, "RSI 周期", 2, 100)
    _within(oversold, "超卖阈值", 1, 49)
    _within(overbought, "超买阈值", 51, 99)

    changes = bars["Close"].diff()
    gains = changes.clip(lower=0)
    losses = -changes.clip(upper=0)
    average_gain = _wilder_average(gains, period)
    average_loss = _wilder_average(losses, period)
    relative_strength = average_gain / average_loss
    rsi = 100 - (100 / (1 + relative_strength))
    rsi = rsi.mask((average_gain == 0) & (average_loss == 0), 50.0)

    previous_rsi = rsi.shift(1)
    buy = (previous_rsi <= oversold) & (rsi > oversold)
    sell = (previous_rsi <= overbought) & (rsi > overbought)
    return StrategyOutput(
        target=_target_from_events(bars.index, buy, sell),
        indicators={"rsi": rsi},
        warmup=period,
    )


def donchian(bars: pd.DataFrame, params: dict[str, float | int]) -> StrategyOutput:
    entry_window = _integer_parameter(params, "entry_window", "入场通道周期")
    exit_window = _integer_parameter(params, "exit_window", "退出通道周期")
    if entry_window <= 0:
        raise StrategyError("入场通道周期必须为正整数")
    if exit_window <= 0:
        raise StrategyError("退出通道周期必须为正整数")
    _within(entry_window, "入场通道周期", 2, 252)
    _within(exit_window, "退出通道周期", 2, 252)

    entry_high = bars["High"].rolling(entry_window).max().shift(1)
    exit_low = bars["Low"].rolling(exit_window).min().shift(1)
    buy = bars["Close"] > entry_high
    sell = bars["Close"] < exit_low
    return StrategyOutput(
        target=_target_from_events(bars.index, buy, sell),
        indicators={"entry_high": entry_high, "exit_low": exit_low},
        warmup=max(entry_window, exit_window),
    )


Generator = Callable[[pd.DataFrame, dict[str, float | int]], StrategyOutput]
GENERATORS: dict[str, Generator] = {
    "buy_hold": buy_hold,
    "sma_cross": sma_cross,
    "rsi_reversal": rsi_reversal,
    "donchian": donchian,
}


def generate_signals(bars: pd.DataFrame, config: StrategyConfig) -> StrategyOutput:
    try:
        generator = GENERATORS[config.key]
    except KeyError as exc:
        raise StrategyError("不支持的策略") from exc
    return generator(bars, config.params)
