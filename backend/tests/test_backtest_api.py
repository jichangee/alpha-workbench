from pathlib import Path
import json

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app import main
from app.datasets import DatasetStore
from app.serialization import json_safe


FIXTURE = Path(__file__).parent / "fixtures" / "prices.csv"
FIXTURE_ROW_COUNT = 4


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(main, "dataset_store", DatasetStore())
    return TestClient(main.app)


@pytest.fixture
def dataset_id(client):
    response = client.post(
        "/api/market-data/preview",
        data={"source": "csv", "symbol": "SPY"},
        files={"file": ("prices.csv", FIXTURE.read_bytes(), "text/csv")},
    )

    assert response.status_code == 200
    return response.json()["datasetId"]


def test_backtest_returns_json_safe_metrics_series_and_trades(client, dataset_id):
    response = client.post(
        "/api/backtests",
        json={
            "datasetId": dataset_id,
            "strategy": {
                "key": "sma_cross",
                "params": {"short_window": 2, "long_window": 3},
            },
            "initialCash": 100000,
            "commission": 0,
            "slippageBps": 5,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {
        "metadata",
        "metrics",
        "series",
        "indicators",
        "fills",
        "trades",
        "warnings",
    }
    assert body["metadata"]["execution"] == "next_open"
    assert len(body["series"]["equity"]) == FIXTURE_ROW_COUNT
    assert body["series"]["dates"] == [
        "2024-01-02",
        "2024-01-03",
        "2024-01-04",
        "2024-01-05",
    ]
    assert body["indicators"]["short_sma"][0] is None
    assert "maxDrawdown" in body["metrics"]
    json.dumps(body, allow_nan=False)


def test_backtest_serializes_fill_and_open_trade_dates(client, dataset_id):
    response = client.post(
        "/api/backtests",
        json={
            "datasetId": dataset_id,
            "strategy": {"key": "buy_hold", "params": {}},
            "initialCash": 1000,
            "commission": 0,
            "slippageBps": 0,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["fills"] == [
        {
            "date": "2024-01-03",
            "side": "buy",
            "price": 102.0,
            "shares": 9,
            "commission": 0.0,
            "notional": 918.0,
        }
    ]
    assert body["trades"] == [
        {
            "entryDate": "2024-01-03",
            "entryPrice": 102.0,
            "shares": 9,
            "exitDate": None,
            "exitPrice": None,
            "grossPnl": None,
            "costs": 0.0,
            "netPnl": None,
            "returnPct": None,
            "isOpen": True,
        }
    ]


def test_backtest_reports_a_missing_dataset_with_a_chinese_404(client):
    response = client.post(
        "/api/backtests",
        json={
            "datasetId": "does-not-exist",
            "strategy": {"key": "buy_hold", "params": {}},
            "initialCash": 100000,
            "commission": 0,
            "slippageBps": 0,
        },
    )

    assert response.status_code == 404
    assert response.json() == {
        "code": "DATASET_NOT_FOUND",
        "message": "未找到数据集，请重新加载行情数据",
        "fields": {},
    }


def test_backtest_maps_invalid_strategy_settings_to_field_validation(client, dataset_id):
    response = client.post(
        "/api/backtests",
        json={
            "datasetId": dataset_id,
            "strategy": {
                "key": "sma_cross",
                "params": {"short_window": 3, "long_window": 3},
            },
            "initialCash": 100000,
            "commission": 0,
            "slippageBps": 0,
        },
    )

    assert response.status_code == 422
    assert response.json() == {
        "code": "VALIDATION_ERROR",
        "message": "请求参数无效",
        "fields": {"strategy": "短均线周期必须小于长均线周期"},
    }


def test_backtest_maps_insufficient_history_to_a_chinese_execution_error(
    client, dataset_id
):
    response = client.post(
        "/api/backtests",
        json={
            "datasetId": dataset_id,
            "strategy": {
                "key": "sma_cross",
                "params": {"short_window": 2, "long_window": 5},
            },
            "initialCash": 100000,
            "commission": 0,
            "slippageBps": 0,
        },
    )

    assert response.status_code == 400
    assert response.json() == {
        "code": "BACKTEST_ERROR",
        "message": "均线交叉策略至少需要 5 个交易日",
        "fields": {},
    }


def test_backtest_rejects_non_positive_initial_cash_as_a_field_error(client, dataset_id):
    response = client.post(
        "/api/backtests",
        json={
            "datasetId": dataset_id,
            "strategy": {"key": "buy_hold", "params": {}},
            "initialCash": 0,
            "commission": 0,
            "slippageBps": 0,
        },
    )

    assert response.status_code == 422
    assert response.json() == {
        "code": "VALIDATION_ERROR",
        "message": "请求参数无效",
        "fields": {"initialCash": "输入不合法"},
    }


def test_json_safe_replaces_non_finite_pandas_and_numpy_values_with_null():
    assert json_safe(
        {
            "nan": np.float64("nan"),
            "infinity": float("inf"),
            "timestamp": pd.Timestamp("2024-01-02"),
            "missing_timestamp": pd.NaT,
        }
    ) == {
        "nan": None,
        "infinity": None,
        "timestamp": pd.Timestamp("2024-01-02").date(),
        "missing_timestamp": None,
    }
