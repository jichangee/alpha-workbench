from __future__ import annotations

from dataclasses import dataclass

from .datasets import DatasetStore
from .engine import EngineError, run_engine
from .metrics import MetricsError, calculate_metrics
from .schemas import BacktestRequest, BacktestResponse
from .serialization import serialize_backtest
from .strategies import StrategyError, generate_signals


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
    except KeyError as error:
        raise DatasetNotFoundError(request.datasetId) from error

    try:
        signals = generate_signals(bars, request.strategy)
    except StrategyError as error:
        if "至少需要" in str(error):
            raise BacktestError(str(error)) from error
        raise BacktestValidationError(str(error), {"strategy": str(error)}) from error

    try:
        engine = run_engine(
            bars,
            signals.target,
            request.initialCash,
            request.commission,
            request.slippageBps,
        )
        metrics = calculate_metrics(
            engine.equity["total"], engine.trades, request.initialCash
        )
    except (EngineError, MetricsError) as error:
        raise BacktestError(str(error)) from error

    return serialize_backtest(
        request.datasetId, request, bars, signals, engine, metrics
    )
