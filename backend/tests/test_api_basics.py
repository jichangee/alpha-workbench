from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_reports_ok():
    assert client.get("/api/health").json() == {"status": "ok"}


def test_strategy_catalog_exposes_four_no_code_strategies():
    response = client.get("/api/strategies")

    assert response.status_code == 200
    assert {item["key"] for item in response.json()} == {
        "buy_hold",
        "sma_cross",
        "rsi_reversal",
        "donchian",
    }
