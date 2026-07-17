from datetime import date, timedelta

import pandas as pd
from fastapi.testclient import TestClient

from app import main
from app.market_data import MarketDataError


client = TestClient(main.app)


def bars(closes: list[float], dates: list[str] | None = None) -> pd.DataFrame:
    index = pd.to_datetime(
        dates or ["2024-01-02", "2024-01-03", "2024-01-04"]
    )
    return pd.DataFrame(
        {
            "Open": closes,
            "High": closes,
            "Low": closes,
            "Close": closes,
        },
        index=index,
    )


def valid_request() -> dict:
    return {
        "start": "2024-01-01",
        "end": "2024-01-05",
        "portfolios": [
            {
                "name": "持仓 1",
                "positions": [
                    {"symbol": "VOO", "weight": 0.5},
                    {"symbol": "QQQ", "weight": 0.5},
                ],
            },
            {
                "name": "持仓 2",
                "positions": [
                    {"symbol": "SOXX", "weight": 0.5},
                    {"symbol": "VOO", "weight": 0.5},
                ],
            },
        ],
    }


def test_downloads_each_unique_symbol_once_and_returns_curves(monkeypatch):
    calls: list[tuple[str, date, date]] = []
    histories = {
        "VOO": bars([100, 110, 120]),
        "QQQ": bars([100, 90, 100]),
        "SOXX": bars([100, 120, 140]),
    }

    def fake_load(symbol: str, start: date, end: date) -> pd.DataFrame:
        calls.append((symbol, start, end))
        return histories[symbol]

    monkeypatch.setattr(main, "load_yahoo", fake_load)

    response = client.post("/api/portfolio-comparisons", json=valid_request())

    assert response.status_code == 200
    assert [call[0] for call in calls] == ["VOO", "QQQ", "SOXX"]
    assert calls[0][1:] == (date(2024, 1, 1), date(2024, 1, 5))
    payload = response.json()
    assert payload["dates"] == ["2024-01-02", "2024-01-03", "2024-01-04"]
    assert payload["portfolios"][0]["equity"] == [100.0, 100.0, 110.0]
    assert payload["portfolios"][0]["metrics"]["totalReturn"] == 0.1
    assert "annualizedVolatility" in payload["portfolios"][0]["metrics"]


def test_accepts_a_third_portfolio_without_redownloading_shared_symbols(monkeypatch):
    request = valid_request()
    request["portfolios"].append(
        {
            "name": "持仓 3",
            "positions": [{"symbol": "VOO", "weight": 1}],
        }
    )
    calls: list[str] = []
    histories = {
        "VOO": bars([100, 110, 120]),
        "QQQ": bars([100, 90, 100]),
        "SOXX": bars([100, 120, 140]),
    }

    def fake_load(symbol: str, *_args) -> pd.DataFrame:
        calls.append(symbol)
        return histories[symbol]

    monkeypatch.setattr(main, "load_yahoo", fake_load)

    response = client.post("/api/portfolio-comparisons", json=request)

    assert response.status_code == 200
    assert calls == ["VOO", "QQQ", "SOXX"]
    assert len(response.json()["portfolios"]) == 3


def test_rejects_invalid_weight_total_without_downloading(monkeypatch):
    request = valid_request()
    request["portfolios"][0]["positions"][0]["weight"] = 0.4

    def should_not_load(*_args):
        raise AssertionError("validation should happen before data loading")

    monkeypatch.setattr(main, "load_yahoo", should_not_load)
    response = client.post("/api/portfolio-comparisons", json=request)

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"


def test_maps_market_data_failures_to_readable_problem(monkeypatch):
    def failed_load(*_args):
        raise MarketDataError("SOXX 行情下载失败")

    monkeypatch.setattr(main, "load_yahoo", failed_load)

    response = client.post("/api/portfolio-comparisons", json=valid_request())

    assert response.status_code == 400
    assert response.json() == {
        "code": "MARKET_DATA_ERROR",
        "message": "SOXX 行情下载失败",
        "fields": {},
    }


def test_maps_missing_common_dates_to_readable_problem(monkeypatch):
    histories = {
        "VOO": bars([100, 101], ["2024-01-02", "2024-01-03"]),
        "QQQ": bars([100, 101], ["2024-01-03", "2024-01-04"]),
        "SOXX": bars([100, 101], ["2024-01-04", "2024-01-05"]),
    }
    monkeypatch.setattr(main, "load_yahoo", lambda symbol, *_args: histories[symbol])

    response = client.post("/api/portfolio-comparisons", json=valid_request())

    assert response.status_code == 400
    assert response.json()["code"] == "PORTFOLIO_COMPARISON_ERROR"
    assert "共同交易日" in response.json()["message"]


def test_rejects_future_date_without_downloading(monkeypatch):
    request = valid_request()
    request["end"] = (date.today() + timedelta(days=1)).isoformat()

    def should_not_load(*_args):
        raise AssertionError("validation should happen before data loading")

    monkeypatch.setattr(main, "load_yahoo", should_not_load)
    response = client.post("/api/portfolio-comparisons", json=request)

    assert response.status_code == 422
