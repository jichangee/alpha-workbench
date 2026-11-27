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


def test_defaults_to_no_rebalancing():
    request = PortfolioComparisonRequest.model_validate(request_payload())

    assert request.portfolios[0].rebalance_frequency == "none"


def test_monthly_rebalancing_resets_drifted_weights_after_period_close():
    payload = request_payload()
    payload["portfolios"][0]["rebalanceFrequency"] = "monthly"
    request = PortfolioComparisonRequest.model_validate(payload)
    dates = [
        "2024-01-30",
        "2024-01-31",
        "2024-02-01",
        "2024-02-29",
        "2024-03-01",
    ]

    result = calculate_portfolio_comparison(
        request,
        {
            "AAA": frame(dates, [100, 200, 200, 100, 100]),
            "BBB": frame(dates, [100, 100, 100, 200, 200]),
        },
    )

    assert result.portfolios[0].equity == pytest.approx(
        [100, 150, 150, 187.5, 187.5]
    )
    assert result.portfolios[0].rebalance_dates == [
        date(2024, 1, 31),
        date(2024, 2, 29),
    ]


def test_threshold_rebalancing_resets_after_an_asset_drifts_by_the_threshold():
    payload = request_payload()
    payload["portfolios"][0].update(
        rebalanceFrequency="threshold",
        rebalanceThreshold=10,
    )
    request = PortfolioComparisonRequest.model_validate(payload)
    dates = ["2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05"]

    result = calculate_portfolio_comparison(
        request,
        {
            "AAA": frame(dates, [100, 130, 200, 200]),
            "BBB": frame(dates, [100, 100, 100, 200]),
        },
    )

    assert result.portfolios[0].equity == pytest.approx([100, 115, 150, 225])
    assert result.portfolios[0].rebalance_dates == [date(2024, 1, 4)]
    assert result.portfolios[0].rebalance_threshold == 10


@pytest.mark.parametrize(
    ("frequency", "dates", "expected"),
    [
        (
            "quarterly",
            ["2024-03-27", "2024-03-28", "2024-04-01"],
            [date(2024, 3, 28)],
        ),
        (
            "yearly",
            ["2024-12-30", "2024-12-31", "2025-01-02"],
            [date(2024, 12, 31)],
        ),
    ],
)
def test_identifies_calendar_rebalance_boundaries(frequency, dates, expected):
    payload = request_payload()
    payload["portfolios"][0]["rebalanceFrequency"] = frequency
    request = PortfolioComparisonRequest.model_validate(payload)

    result = calculate_portfolio_comparison(
        request,
        {
            "AAA": frame(dates, [100, 100, 100]),
            "BBB": frame(dates, [100, 100, 100]),
        },
    )

    assert result.portfolios[0].rebalance_dates == expected


def test_does_not_record_a_terminal_rebalance():
    payload = request_payload()
    payload["portfolios"][0]["rebalanceFrequency"] = "monthly"
    request = PortfolioComparisonRequest.model_validate(payload)

    result = calculate_portfolio_comparison(
        request,
        {
            "AAA": frame(["2024-01-30", "2024-01-31"], [100, 110]),
            "BBB": frame(["2024-01-30", "2024-01-31"], [100, 90]),
        },
    )

    assert result.portfolios[0].rebalance_dates == []


def test_rejects_an_unsupported_rebalance_frequency():
    payload = request_payload()
    payload["portfolios"][0]["rebalanceFrequency"] = "weekly"

    with pytest.raises(ValidationError, match="none|monthly|quarterly|yearly"):
        PortfolioComparisonRequest.model_validate(payload)


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


def test_accepts_five_portfolios():
    payload = request_payload()
    payload["portfolios"].extend(
        {
            "name": f"持仓 {index}",
            "positions": [{"symbol": f"S{index}", "weight": 1}],
        }
        for index in range(3, 6)
    )

    request = PortfolioComparisonRequest.model_validate(payload)

    assert len(request.portfolios) == 5


def test_rejects_six_portfolios():
    payload = request_payload()
    payload["portfolios"].extend(
        {
            "name": f"持仓 {index}",
            "positions": [{"symbol": f"S{index}", "weight": 1}],
        }
        for index in range(3, 7)
    )

    with pytest.raises(ValidationError, match="at most 5"):
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
    returns = pd.Series([-0.2, 0.5])
    expected_volatility = returns.std(ddof=1) * (252**0.5)
    expected_sharpe = returns.mean() / returns.std(ddof=1) * (252**0.5)
    assert metrics.max_drawdown == pytest.approx(-0.2)
    assert metrics.annualized_volatility == pytest.approx(expected_volatility)
    assert metrics.sharpe_ratio == pytest.approx(expected_sharpe)
    assert metrics.cagr is not None


def test_sharpe_ratio_is_none_without_enough_returns():
    request = PortfolioComparisonRequest.model_validate(request_payload())

    result = calculate_portfolio_comparison(
        request,
        {
            "AAA": frame(["2024-01-02", "2024-01-03", "2024-01-04"], [100, 110, 120]),
            "BBB": frame(["2024-01-03", "2024-01-04", "2024-01-05"], [100, 100, 90]),
        },
    )

    assert result.portfolios[0].metrics.sharpe_ratio is None
