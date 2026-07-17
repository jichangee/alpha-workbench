import pytest
import pandas as pd

from app.backtests import run_backtest
from app.datasets import DatasetStore
from app.schemas import BacktestRequest, DatasetMetadata


# 1,000 美元以 100 美元开盘价买入 10 股，再以 110 美元开盘价卖出：1,100 美元。
EXPECTED_ENDING_EQUITY = 1100.0


def run_fixed_fixture(
    strategy: str, short_window: int, long_window: int
):
    dates = pd.to_datetime(
        [
            "2023-12-29",
            "2024-01-02",
            "2024-01-03",
            "2024-01-04",
            "2024-01-05",
            "2024-01-08",
            "2024-01-09",
            "2024-01-10",
        ]
    )
    closes = pd.Series([100, 100, 90, 120, 120, 120, 80, 80], dtype="float64")
    opens = pd.Series([100, 100, 90, 120, 100, 120, 80, 110], dtype="float64")
    bars = pd.DataFrame(
        {
            "Open": opens.to_numpy(),
            "High": (pd.concat([opens, closes], axis=1).max(axis=1) + 1).to_numpy(),
            "Low": (pd.concat([opens, closes], axis=1).min(axis=1) - 1).to_numpy(),
            "Close": closes.to_numpy(),
        },
        index=dates,
    )
    store = DatasetStore()
    dataset_id = store.put(
        bars,
        DatasetMetadata(
            symbol="FIXED", source="csv", start=dates[0].date(), end=dates[-1].date()
        ),
    )
    return run_backtest(
        store,
        BacktestRequest(
            datasetId=dataset_id,
            strategy={
                "key": strategy,
                "params": {"short_window": short_window, "long_window": long_window},
            },
            initialCash=1000,
            commission=0,
            slippageBps=0,
        ),
    )


def test_fixed_sma_scenario_has_exact_fill_dates_and_ending_equity():
    result = run_fixed_fixture(strategy="sma_cross", short_window=2, long_window=3)

    assert [fill.date.strftime("%Y-%m-%d") for fill in result.fills] == [
        "2024-01-05",
        "2024-01-10",
    ]
    assert result.metadata.execution == "next_open"
    assert result.metrics.ending_equity == pytest.approx(EXPECTED_ENDING_EQUITY)
