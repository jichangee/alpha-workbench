import json
from math import sqrt

import pandas as pd
import pytest

from app.engine import Trade
from app.metrics import calculate_metrics


def closed_trade(net_pnl: float) -> Trade:
    return Trade(
        entry_date=pd.Timestamp("2024-01-02"),
        entry_price=10,
        shares=10,
        exit_date=pd.Timestamp("2024-01-03"),
        exit_price=10 + net_pnl / 10,
        gross_pnl=net_pnl,
        costs=0,
        net_pnl=net_pnl,
        return_pct=net_pnl / 100,
    )


def test_metrics_match_exact_daily_return_formulas():
    equity = pd.Series(
        [100.0, 110.0, 99.0],
        index=pd.date_range("2024-01-02", periods=3, freq="B"),
    )

    metrics = calculate_metrics(
        equity, [closed_trade(10), closed_trade(-1), closed_trade(0)], initial_cash=100
    )

    daily_returns = pd.Series([0.1, -0.1])
    daily_std = float(daily_returns.std(ddof=1))
    assert metrics.ending_equity == 99
    assert metrics.total_return == pytest.approx(-0.01)
    assert metrics.cagr == pytest.approx(0.99 ** (252 / 2) - 1)
    assert metrics.annualized_volatility == pytest.approx(daily_std * sqrt(252))
    assert metrics.sharpe_ratio == pytest.approx(
        float(daily_returns.mean()) / daily_std * sqrt(252)
    )
    assert metrics.max_drawdown == pytest.approx(-0.1)
    assert metrics.trade_count == 3
    assert metrics.win_rate == pytest.approx(1 / 3)


def test_open_trades_do_not_count_as_closed_trades():
    open_trade = Trade(
        entry_date=pd.Timestamp("2024-01-02"),
        entry_price=10,
        shares=10,
        exit_date=None,
        exit_price=None,
        gross_pnl=None,
        costs=1,
        net_pnl=None,
        return_pct=None,
    )

    metrics = calculate_metrics(pd.Series([100.0, 110.0]), [open_trade], 100)

    assert metrics.trade_count == 0
    assert metrics.win_rate is None


def test_zero_volatility_makes_sharpe_undefined_without_non_json_numbers():
    metrics = calculate_metrics(pd.Series([100.0, 100.0, 100.0]), [], 100)

    assert metrics.annualized_volatility == 0
    assert metrics.sharpe_ratio is None
    assert metrics.win_rate is None
    assert metrics.cagr == 0
    json.dumps(metrics.__dict__, allow_nan=False)


def test_one_observation_has_undefined_annualized_statistics():
    metrics = calculate_metrics(pd.Series([100.0]), [], 100)

    assert metrics.total_return == 0
    assert metrics.cagr is None
    assert metrics.annualized_volatility is None
    assert metrics.sharpe_ratio is None
    assert metrics.max_drawdown == 0
    json.dumps(metrics.__dict__, allow_nan=False)


def test_zero_ending_equity_keeps_defined_metrics_and_nulls_cagr():
    metrics = calculate_metrics(pd.Series([100.0, 0.0]), [], 100)

    assert metrics.ending_equity == 0
    assert metrics.total_return == -1
    assert metrics.cagr is None
    assert metrics.max_drawdown == -1
    json.dumps(metrics.__dict__, allow_nan=False)


def test_unrepresentable_ratios_become_none_instead_of_infinity():
    metrics = calculate_metrics(pd.Series([1e-300, 1e300]), [], 1e-300)

    assert metrics.ending_equity == 1e300
    assert metrics.total_return is None
    assert metrics.cagr is None
    json.dumps(metrics.__dict__, allow_nan=False)


def test_negative_ending_equity_has_no_real_valued_cagr():
    metrics = calculate_metrics(pd.Series([100.0, -10.0]), [], 100)

    assert metrics.total_return == pytest.approx(-1.1)
    assert metrics.cagr is None
    assert metrics.max_drawdown == pytest.approx(-1.1)
    json.dumps(metrics.__dict__, allow_nan=False)
