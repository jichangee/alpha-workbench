import pandas as pd
import pytest

from app.schemas import StrategyConfig
from app.strategies import InsufficientHistoryError, StrategyError, generate_signals


def bars_from_closes(closes: list[float]) -> pd.DataFrame:
    index = pd.date_range("2024-01-02", periods=len(closes), freq="B")
    return pd.DataFrame(
        {"Open": closes, "High": closes, "Low": closes, "Close": closes}, index=index
    )


def test_buy_and_hold_targets_full_position_from_the_first_bar():
    bars = bars_from_closes([10, 11, 12])

    output = generate_signals(bars, StrategyConfig(key="buy_hold"))

    assert output.target.tolist() == [1, 1, 1]
    assert output.target.index.equals(bars.index)
    assert output.target.dtype == "int64"
    assert output.indicators == {}
    assert output.warmup == 0


def test_buy_and_hold_requires_a_next_session_for_open_execution():
    with pytest.raises(
        InsufficientHistoryError,
        match="买入并持有策略至少需要 2 个交易日，才能在次日开盘买入",
    ):
        generate_signals(bars_from_closes([10]), StrategyConfig(key="buy_hold"))


def test_sma_cross_changes_target_only_after_a_completed_cross():
    bars = bars_from_closes([10, 10, 10, 11, 12, 9])

    output = generate_signals(
        bars, StrategyConfig(key="sma_cross", params={"short_window": 2, "long_window": 3})
    )

    assert output.target.tolist() == [0, 0, 0, 1, 1, 0]
    assert pd.isna(output.indicators["short_sma"].iloc[0])
    assert output.indicators["short_sma"].iloc[1:].tolist() == [10.0, 10.0, 10.5, 11.5, 10.5]
    assert output.indicators["long_sma"].iloc[2:].tolist() == [10.0, 10.333333333333334, 11.0, 10.666666666666666]
    assert output.warmup == 3


def test_sma_rejects_short_window_not_below_long_window():
    with pytest.raises(StrategyError, match="短均线周期必须小于长均线周期"):
        generate_signals(
            bars_from_closes(list(range(20))),
            StrategyConfig(key="sma_cross", params={"short_window": 10, "long_window": 5}),
        )


def test_rsi_reversal_uses_wilder_smoothing_and_crosses_to_change_target():
    bars = bars_from_closes([10, 9, 8, 9, 10, 11])

    output = generate_signals(
        bars,
        StrategyConfig(
            key="rsi_reversal", params={"period": 2, "oversold": 30, "overbought": 80}
        ),
    )

    assert output.indicators["rsi"].iloc[4] == pytest.approx(75.0)
    assert output.target.tolist() == [0, 0, 0, 1, 1, 0]
    assert output.warmup == 2


def test_rsi_seeds_wilder_smoothing_with_the_first_period_average():
    output = generate_signals(
        bars_from_closes([10, 11, 13, 12]),
        StrategyConfig(
            key="rsi_reversal", params={"period": 3, "oversold": 30, "overbought": 70}
        ),
    )

    assert output.indicators["rsi"].iloc[3] == pytest.approx(75.0)


def test_rsi_rejects_oversold_not_below_overbought():
    with pytest.raises(StrategyError, match="超卖阈值必须小于超买阈值"):
        generate_signals(
            bars_from_closes(list(range(20))),
            StrategyConfig(
                key="rsi_reversal", params={"period": 2, "oversold": 80, "overbought": 70}
            ),
        )


def test_donchian_uses_prior_bars_only_for_entry_and_exit_channels():
    bars = bars_from_closes([10, 11, 12, 13, 10])

    output = generate_signals(
        bars, StrategyConfig(key="donchian", params={"entry_window": 3, "exit_window": 2})
    )

    assert output.indicators["entry_high"].iloc[3:].tolist() == [12.0, 13.0]
    assert output.indicators["exit_low"].iloc[2:].tolist() == [10.0, 11.0, 12.0]
    assert output.target.tolist() == [0, 0, 0, 1, 0]
    assert output.warmup == 3


def test_donchian_rejects_a_nonpositive_window():
    with pytest.raises(StrategyError, match="入场通道周期必须为正整数"):
        generate_signals(
            bars_from_closes(list(range(20))),
            StrategyConfig(key="donchian", params={"entry_window": 0, "exit_window": 2}),
        )


@pytest.mark.parametrize(
    ("config", "closes", "message"),
    [
        (
            StrategyConfig(key="buy_hold"),
            [],
            "买入并持有策略至少需要 2 个交易日，才能在次日开盘买入",
        ),
        (
            StrategyConfig(key="sma_cross", params={"short_window": 2, "long_window": 3}),
            [10, 11],
            "均线交叉策略至少需要 3 个交易日",
        ),
        (
            StrategyConfig(
                key="rsi_reversal", params={"period": 2, "oversold": 30, "overbought": 70}
            ),
            [10, 11],
            "RSI 反转策略至少需要 3 个交易日",
        ),
        (
            StrategyConfig(key="donchian", params={"entry_window": 3, "exit_window": 2}),
            [10, 11, 12],
            "唐奇安通道突破策略至少需要 4 个交易日",
        ),
    ],
)
def test_strategy_rejects_insufficient_history(config, closes, message):
    with pytest.raises(StrategyError, match=message):
        generate_signals(bars_from_closes(closes), config)
