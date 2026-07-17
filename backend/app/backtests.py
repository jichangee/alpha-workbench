from __future__ import annotations

from dataclasses import dataclass

from .catalog import STRATEGIES
from .datasets import DatasetStore
from .engine import EngineError, run_engine
from .metrics import MetricsError, calculate_metrics
from .schemas import BacktestRequest, BacktestResponse, StrategyConfig
from .serialization import serialize_backtest
from .strategies import InsufficientHistoryError, StrategyError, generate_signals


class DatasetNotFoundError(LookupError):
    """A requested temporary dataset is no longer available."""


@dataclass(frozen=True)
class BacktestValidationError(ValueError):
    """A strategy setting is invalid and can be attached to the request field."""

    message: str
    fields: dict[str, str]

    def __str__(self) -> str:
        return self.message


class BacktestError(ValueError):
    """A user-correctable problem while executing a valid backtest request."""


def run_backtest(store: DatasetStore, request: BacktestRequest) -> BacktestResponse:
    """Run a stored dataset through signals, execution, metrics, and serialization."""
    try:
        bars = store.get(request.datasetId)
        primary_metadata = store.get_metadata(request.datasetId)
    except KeyError as error:
        raise DatasetNotFoundError(request.datasetId) from error

    alternate_bars = None
    alternate_symbol = None
    if request.positionMode == "rotate":
        try:
            alternate_bars = store.get(request.alternateDatasetId or "")
            alternate_metadata = store.get_metadata(request.alternateDatasetId or "")
        except KeyError as error:
            raise DatasetNotFoundError(request.alternateDatasetId or "") from error
        if alternate_metadata.symbol == primary_metadata.symbol:
            raise BacktestValidationError(
                "替代标的不能与主标的相同",
                {"alternateDatasetId": "替代标的不能与主标的相同"},
            )
        common_dates = bars.index.intersection(alternate_bars.index)
        if common_dates.empty:
            raise BacktestError("主标的和替代标的没有共同交易日")
        bars = bars.loc[common_dates]
        alternate_bars = alternate_bars.loc[common_dates]
        alternate_symbol = alternate_metadata.symbol

    try:
        signals = generate_signals(bars, _strategy_with_defaults(request.strategy))
    except InsufficientHistoryError as error:
        raise BacktestError(str(error)) from error
    except StrategyError as error:
        raise BacktestValidationError(str(error), {"strategy": str(error)}) from error

    try:
        engine = run_engine(
            bars,
            signals.target,
            request.initialCash,
            request.commission,
            request.slippageBps,
            primary_symbol=primary_metadata.symbol,
            alternate_bars=alternate_bars,
            alternate_symbol=alternate_symbol,
        )
        metrics = calculate_metrics(
            engine.equity["total"], engine.trades, request.initialCash
        )
    except (EngineError, MetricsError) as error:
        raise BacktestError(str(error)) from error

    return serialize_backtest(
        request.datasetId,
        request,
        bars,
        signals,
        engine,
        metrics,
        primary_metadata.symbol,
        alternate_symbol,
    )


def _strategy_with_defaults(request_strategy: StrategyConfig) -> StrategyConfig:
    definition = next(
        strategy for strategy in STRATEGIES if strategy.key == request_strategy.key
    )
    defaults = {parameter.key: parameter.default for parameter in definition.parameters}
    unknown = set(request_strategy.params) - set(defaults)
    if unknown:
        fields = {
            f"strategy.params.{key}": "输入不合法" for key in sorted(unknown)
        }
        raise BacktestValidationError("策略参数无效", fields)
    return request_strategy.model_copy(
        update={"params": {**defaults, **request_strategy.params}}
    )
