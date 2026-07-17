from datetime import date, timedelta

import pandas as pd
import pytest
from pydantic import ValidationError

from app.portfolio_comparison import (
    PortfolioComparisonError,
    calculate_portfolio_comparison,
)
from app.schemas import PortfolioComparisonRequest


def frame(dates: list[str], closes: list[float]) -> pd.DataFrame:
    return pd.DataFrame({"Close": closes}, index=pd.to_datetime(dates))


def request_payload() -> dict:
    return {
        "start": "2024-01-01",
        "end": "2024-01-05",
        "portfolios": [
            {
                "name": "均衡",
                "positions": [
                    {"symbol": "aaa", "weight": 0.5},
                    {"symbol": "BBB", "weight": 0.5},
                ],
            },
            {
                "name": "单股",
                "positions": [{"symbol": "AAA", "weight": 1}],
            },
        ],
    }


def test_calculates_buy_and_hold_curves_on_common_dates():
    request = PortfolioComparisonRequest.model_validate(request_payload())

    result = calculate_portfolio_comparison(
        request,
        {
            "AAA": frame(
                ["2024-01-02", "2024-01-03", "2024-01-04"],
                [100, 110, 120],
            ),
            "BBB": frame(
                ["2024-01-03", "2024-01-04", "2024-01-05"],
                [100, 100, 90],
            ),
        },
    )

    assert result.dates == [date(2024, 1, 3), date(2024, 1, 4)]
    assert result.start == date(2024, 1, 3)
    assert result.end == date(2024, 1, 4)
    assert result.portfolios[0].equity == pytest.approx([100, 104.5454545])
    assert result.portfolios[1].equity == pytest.approx([100, 109.0909091])
    assert result.portfolios[0].positions[0].symbol == "AAA"
    assert result.portfolios[0].metrics.total_return == pytest.approx(0.045454545)
    assert result.portfolios[0].metrics.max_drawdown == pytest.approx(0)
    assert result.portfolios[0].metrics.annualized_volatility is None


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (
            lambda payload: payload["portfolios"][0]["positions"].append(
                {"symbol": "AAA", "weight": 0.1}
            ),
            "重复",
        ),
        (
            lambda payload: payload["portfolios"][0]["positions"][0].update(
                weight=0
            ),
            "greater than 0",
        ),
        (
            lambda payload: payload["portfolios"][0]["positions"][0].update(
                weight=0.4
            ),
            "100%",
        ),
        (
            lambda payload: payload.update(end="2023-12-31"),
            "不能早于",
        ),
        (
            lambda payload: payload.update(
                end=(date.today() + timedelta(days=1)).isoformat()
            ),
            "不能晚于",
        ),
    ],
)
def test_rejects_invalid_portfolio_requests(mutate, message):
    payload = request_payload()
    mutate(payload)

    with pytest.raises(ValidationError, match=message):
        PortfolioComparisonRequest.model_validate(payload)


def test_rejects_more_than_eight_positions():
    payload = request_payload()
    payload["portfolios"][0]["positions"] = [
        {"symbol": f"S{index}", "weight": 0.125} for index in range(8)
    ] + [{"symbol": "S8", "weight": 0.001}]

    with pytest.raises(ValidationError, match="at most 8"):
        PortfolioComparisonRequest.model_validate(payload)


def test_rejects_fewer_than_two_common_observations():
    request = PortfolioComparisonRequest.model_validate(request_payload())

    with pytest.raises(PortfolioComparisonError, match="共同交易日"):
        calculate_portfolio_comparison(
            request,
            {
                "AAA": frame(["2024-01-02", "2024-01-03"], [100, 110]),
                "BBB": frame(["2024-01-03", "2024-01-04"], [100, 105]),
            },
        )


def test_calculates_drawdown_and_annualized_volatility():
    payload = request_payload()
    payload["portfolios"][0] = {
        "name": "波动组合",
        "positions": [{"symbol": "AAA", "weight": 1}],
    }
    payload["portfolios"][1] = {
        "name": "对照",
        "positions": [{"symbol": "BBB", "weight": 1}],
    }
    request = PortfolioComparisonRequest.model_validate(payload)
    dates = ["2024-01-02", "2024-01-03", "2024-01-04"]

    result = calculate_portfolio_comparison(
        request,
        {
            "AAA": frame(dates, [100, 80, 120]),
            "BBB": frame(dates, [100, 100, 100]),
        },
    )

    metrics = result.portfolios[0].metrics
    expected_volatility = pd.Series([-0.2, 0.5]).std(ddof=1) * (252**0.5)
    assert metrics.max_drawdown == pytest.approx(-0.2)
    assert metrics.annualized_volatility == pytest.approx(expected_volatility)
    assert metrics.cagr is not None
