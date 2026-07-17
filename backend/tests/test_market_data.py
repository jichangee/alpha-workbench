from datetime import date
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app import main
from app.datasets import DatasetStore
from app.main import app
from app import market_data
from app.market_data import MarketDataError, load_yahoo, normalize_bars
from app.schemas import DatasetMetadata


def valid_frame() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "Open": [100, 102],
            "High": [102, 104],
            "Low": [99, 101],
            "Close": [101, 103],
        },
        index=pd.to_datetime(["2024-01-02", "2024-01-03"]),
    )


def test_normalize_bars_sorts_deduplicates_and_standardizes_columns():
    raw = pd.DataFrame(
        {
            "date": ["2024-01-03", "2024-01-02", "2024-01-02"],
            "open": [102, 100, 100],
            "high": [104, 102, 102],
            "low": [101, 99, 99],
            "close": [103, 101, 101],
        }
    )

    bars = normalize_bars(raw)

    assert list(bars.columns[:4]) == ["Open", "High", "Low", "Close"]
    assert bars.index.is_monotonic_increasing
    assert len(bars) == 2


def test_normalize_bars_rejects_close_outside_daily_range():
    raw = valid_frame().assign(Close=999)

    with pytest.raises(MarketDataError, match="收盘价必须位于最高价和最低价之间"):
        normalize_bars(raw)


def test_dataset_store_isolates_stored_and_returned_frames():
    store = DatasetStore()
    original = valid_frame()
    dataset_id = store.put(
        original,
        DatasetMetadata(symbol="SPY", source="csv", start="2024-01-02", end="2024-01-03"),
    )
    original.loc[original.index[0], "Close"] = 1

    retrieved = store.get(dataset_id)
    retrieved.loc[retrieved.index[0], "Close"] = 2

    assert retrieved.index[0].isoformat().startswith("2024-01-02")
    assert store.get(dataset_id).iloc[0]["Close"] == 101


def test_load_yahoo_normalizes_one_symbol_multiindex_and_uses_disk_cache(
    monkeypatch, tmp_path
):
    calls = []
    raw = valid_frame()
    raw.columns = pd.MultiIndex.from_product([raw.columns, ["SPY"]])

    def fake_download(symbol, *, start, end, auto_adjust, progress):
        calls.append((symbol, start, end, auto_adjust, progress))
        return raw

    monkeypatch.setattr(market_data, "CACHE_DIR", tmp_path)
    monkeypatch.setattr(market_data.yf, "download", fake_download)

    first = load_yahoo("SPY", date(2024, 1, 2), date(2024, 1, 4))
    second = load_yahoo("SPY", date(2024, 1, 2), date(2024, 1, 4))

    assert list(first.columns[:4]) == ["Open", "High", "Low", "Close"]
    assert first.equals(second)
    assert calls == [("SPY", date(2024, 1, 2), date(2024, 1, 4), True, False)]


def test_preview_accepts_csv_and_returns_dataset_summary():
    fixture = Path(__file__).parent / "fixtures" / "prices.csv"
    client = TestClient(app)

    response = client.post(
        "/api/market-data/preview",
        data={"source": "csv", "symbol": "SPY"},
        files={"file": ("prices.csv", fixture.read_bytes(), "text/csv")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["symbol"] == "SPY"
    assert body["start"] == "2024-01-02"
    assert body["end"] == "2024-01-05"
    assert body["rows"] == 4
    assert len(body["preview"]) == 4
    assert body["warnings"] == []
    assert body["datasetId"]


def test_preview_maps_yahoo_download_failure_to_market_data_error(monkeypatch):
    def failed_download(*_args, **_kwargs):
        raise MarketDataError("未获取到行情数据，请检查股票代码、日期范围或网络连接")

    monkeypatch.setattr(main, "load_yahoo", failed_download)
    client = TestClient(app)

    response = client.post(
        "/api/market-data/preview",
        data={
            "source": "yahoo",
            "symbol": "BAD",
            "start": "2024-01-02",
            "end": "2024-01-05",
        },
    )

    assert response.status_code == 400
    assert response.json()["code"] == "MARKET_DATA_ERROR"


def test_preview_maps_invalid_form_input_to_field_error_contract():
    client = TestClient(app)

    response = client.post("/api/market-data/preview", data={"source": "other"})

    assert response.status_code == 422
    assert response.json() == {
        "code": "VALIDATION_ERROR",
        "message": "请求参数无效",
        "fields": {"source": "输入不合法"},
    }


def test_preview_rejects_empty_csv_as_invalid_input():
    client = TestClient(app, raise_server_exceptions=False)

    response = client.post(
        "/api/market-data/preview",
        data={"source": "csv"},
        files={"file": ("empty.csv", b"Date,Open,High,Low,Close\n", "text/csv")},
    )

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"
    assert response.json()["fields"] == {"file": "行情数据不能为空"}


def test_normalize_bars_rejects_missing_price_values():
    raw = valid_frame().assign(Close=float("nan"))

    with pytest.raises(MarketDataError, match="行情价格必须是数字"):
        normalize_bars(raw)


def test_preview_preserves_period_in_csv_symbol():
    fixture = Path(__file__).parent / "fixtures" / "prices.csv"
    client = TestClient(app)

    response = client.post(
        "/api/market-data/preview",
        data={"source": "csv", "symbol": "BRK.B"},
        files={"file": ("prices.csv", fixture.read_bytes(), "text/csv")},
    )

    assert response.status_code == 200
    assert response.json()["symbol"] == "BRK.B"


def test_preview_rejects_blank_csv_as_invalid_input():
    client = TestClient(app, raise_server_exceptions=False)

    response = client.post(
        "/api/market-data/preview",
        data={"source": "csv"},
        files={"file": ("blank.csv", b"", "text/csv")},
    )

    assert response.status_code == 422
    assert response.json()["fields"] == {"file": "CSV 文件不能为空"}


def test_normalize_bars_rejects_frame_without_dates():
    raw = valid_frame().reset_index(drop=True)

    with pytest.raises(MarketDataError, match="缺少日期列"):
        normalize_bars(raw)


def test_normalize_bars_rejects_infinite_price_values():
    raw = valid_frame().assign(Close=float("inf"))

    with pytest.raises(MarketDataError, match="行情价格必须是数字"):
        normalize_bars(raw)


def test_preview_rejects_blank_yahoo_symbol_before_loading(monkeypatch):
    def should_not_load(*_args, **_kwargs):
        raise AssertionError("Yahoo loader should not be called")

    monkeypatch.setattr(main, "load_yahoo", should_not_load)
    client = TestClient(app, raise_server_exceptions=False)

    response = client.post(
        "/api/market-data/preview",
        data={
            "source": "yahoo",
            "symbol": "   ",
            "start": "2024-01-02",
            "end": "2024-01-05",
        },
    )

    assert response.status_code == 422
    assert response.json()["fields"] == {"symbol": "请输入股票代码"}
