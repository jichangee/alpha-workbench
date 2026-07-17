import numpy as np
import pandas as pd
import pytest

from app.engine import EngineError, run_engine


def make_bars(opens: list[float], closes: list[float]) -> pd.DataFrame:
    index = pd.date_range("2024-01-02", periods=len(opens), freq="B")
    return pd.DataFrame(
        {
            "Open": opens,
            "High": [max(open_price, close) for open_price, close in zip(opens, closes)],
            "Low": [min(open_price, close) for open_price, close in zip(opens, closes)],
            "Close": closes,
        },
        index=index,
    )


def test_signal_executes_at_next_open_without_lookahead():
    bars = make_bars(opens=[10, 20, 30], closes=[11, 21, 31])
    target = pd.Series([1, 1, 1], index=bars.index)

    result = run_engine(bars, target, 100, commission=0, slippage_bps=0)

    assert result.fills[0].date == bars.index[1]
    assert result.fills[0].side == "buy"
    assert result.fills[0].price == 20
    assert result.fills[0].shares == 5
    assert result.equity.iloc[0]["total"] == 100
    assert result.equity.iloc[-1]["total"] == 155


def test_costs_reduce_purchasing_power_and_sale_proceeds():
    bars = make_bars(opens=[100, 100, 110], closes=[100, 100, 110])
    target = pd.Series([1, 0, 0], index=bars.index)

    with_costs = run_engine(bars, target, 1_000, commission=2, slippage_bps=10)
    without_costs = run_engine(bars, target, 1_000, commission=0, slippage_bps=0)

    assert with_costs.fills[0].shares == 9
    assert with_costs.fills[0].price == pytest.approx(100.1)
    assert with_costs.fills[1].price == pytest.approx(109.89)
    assert with_costs.equity.iloc[-1]["total"] < without_costs.equity.iloc[-1]["total"]


def test_round_trip_ledger_reconciles_with_cash_and_costs():
    bars = make_bars(opens=[10, 10, 12], closes=[10, 11, 12])
    target = pd.Series([1, 0, 0], index=bars.index)

    result = run_engine(bars, target, 105, commission=1, slippage_bps=0)

    assert result.equity.iloc[1].to_dict() == {
        "cash": 4.0,
        "shares": 10.0,
        "holdings": 110.0,
        "total": 114.0,
        "strategy": 114.0 / 105.0,
        "benchmark": 115.0 / 105.0,
        "drawdown": 0.0,
        "benchmark_drawdown": 0.0,
    }
    trade = result.trades[0]
    assert trade.entry_date == bars.index[1]
    assert trade.exit_date == bars.index[2]
    assert trade.shares == 10
    assert trade.gross_pnl == 20
    assert trade.costs == 2
    assert trade.net_pnl == 18
    assert trade.return_pct == pytest.approx(18 / 101)
    assert result.equity.iloc[-1]["cash"] == 123
    assert result.equity.iloc[-1]["total"] - 105 == trade.net_pnl


def test_open_position_is_marked_to_close_without_fabricated_sale():
    bars = make_bars(opens=[10, 20, 30], closes=[10, 21, 31])
    target = pd.Series([1, 1, 1], index=bars.index)

    result = run_engine(bars, target, 100, commission=0, slippage_bps=0)

    assert [fill.side for fill in result.fills] == ["buy"]
    assert len(result.trades) == 1
    assert result.trades[0].exit_date is None
    assert result.trades[0].net_pnl is None
    assert result.equity.iloc[-1]["holdings"] == 155
    assert result.equity.iloc[-1]["total"] == 155


def test_benchmark_buys_integer_shares_on_first_executable_session_without_costs():
    bars = make_bars(opens=[5, 30, 40], closes=[5, 31, 44])
    target = pd.Series([0, 0, 0], index=bars.index)

    result = run_engine(bars, target, 100, commission=99, slippage_bps=500)

    assert result.equity["benchmark"].tolist() == pytest.approx(
        [1.0, 103 / 100, 142 / 100]
    )
    assert result.equity["benchmark_drawdown"].tolist() == [0.0, 0.0, 0.0]


def test_drawdown_is_calculated_from_each_curves_running_peak():
    bars = make_bars(opens=[10, 10, 10, 10], closes=[10, 12, 9, 11])
    target = pd.Series([1, 1, 1, 1], index=bars.index)

    result = run_engine(bars, target, 100, commission=0, slippage_bps=0)

    assert result.equity["drawdown"].tolist() == pytest.approx(
        [0.0, 0.0, -0.25, -1 / 12]
    )
    assert result.equity["benchmark_drawdown"].tolist() == pytest.approx(
        [0.0, 0.0, -0.25, -1 / 12]
    )


def test_unaffordable_buy_is_ignored_with_a_warning_and_no_leverage():
    bars = make_bars(opens=[10, 100], closes=[10, 100])
    target = pd.Series([1, 1], index=bars.index)

    result = run_engine(bars, target, 50, commission=1, slippage_bps=0)

    assert result.fills == []
    assert result.trades == []
    assert result.equity.iloc[-1]["cash"] == 50
    assert result.warnings == ["2024-01-03：资金不足，买入信号未成交"]


def test_engine_rejects_an_exit_fee_that_would_create_debt():
    bars = make_bars(opens=[60, 60, 1], closes=[60, 60, 1])
    target = pd.Series([1, 0, 0], index=bars.index)

    with pytest.raises(EngineError, match="卖出所得和现金不足以支付佣金"):
        run_engine(bars, target, 100, commission=40, slippage_bps=0)


def test_engine_rejects_target_outside_long_flat_states():
    bars = make_bars(opens=[10, 10], closes=[10, 10])
    target = pd.Series([0, 2], index=bars.index)

    with pytest.raises(EngineError, match="目标持仓只能为 0 或 1"):
        run_engine(bars, target, 100, commission=0, slippage_bps=0)


def test_engine_rejects_target_with_different_dates():
    bars = make_bars(opens=[10, 10], closes=[10, 10])
    target = pd.Series([0, 1], index=pd.date_range("2025-01-01", periods=2))

    with pytest.raises(EngineError, match="目标持仓必须与行情日期完全对齐"):
        run_engine(bars, target, 100, commission=0, slippage_bps=0)


@pytest.mark.parametrize(
    ("opens", "closes", "target_values", "initial_cash", "slippage_bps"),
    [
        ([1, 1e-308], [1, 1e-308], [0, 0], 1e308, 0),
        ([1, 1e308], [1, 1e308], [1, 1], 100, 9_999),
        ([1, 1], [1, 1e308], [1, 1], 1e308, 0),
        ([1e-308, 1e-308], [1e-308, 1e308], [1, 1], 1e-308, 0),
        ([1, 1, 1e308], [1, 1, 1e308], [1, 0, 0], 1e308, 0),
    ],
    ids=[
        "benchmark-affordable-shares",
        "slipped-fill-price",
        "position-holdings",
        "normalized-equity",
        "sale-proceeds",
    ],
)
def test_engine_maps_extreme_finite_arithmetic_to_engine_error(
    opens, closes, target_values, initial_cash, slippage_bps
):
    bars = make_bars(opens=opens, closes=closes)
    target = pd.Series(target_values, index=bars.index)

    with pytest.raises(EngineError, match="超出有限数值范围"):
        run_engine(
            bars,
            target,
            initial_cash,
            commission=0,
            slippage_bps=slippage_bps,
        )


def test_engine_returns_only_finite_equity_for_large_representable_values():
    bars = make_bars(opens=[1e100, 1e100], closes=[1e100, 1.1e100])
    target = pd.Series([1, 1], index=bars.index)

    result = run_engine(bars, target, 1e200, commission=0, slippage_bps=5)

    assert np.isfinite(result.equity.to_numpy(dtype=float)).all()
