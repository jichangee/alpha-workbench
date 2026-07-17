from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


StrategyKey = Literal["buy_hold", "sma_cross", "rsi_reversal", "donchian"]
ParameterType = Literal["integer", "number"]
MarketDataSource = Literal["yahoo", "csv"]


class StrategyConfig(BaseModel):
    """A selected strategy and its numeric settings."""

    key: StrategyKey
    params: dict[str, float | int] = Field(default_factory=dict)


class StrategyParameter(BaseModel):
    """Metadata used to render and validate a strategy setting."""

    key: str
    name: str
    description: str
    type: ParameterType
    default: float | int
    minimum: float | int
    maximum: float | int


class CrossFieldRule(BaseModel):
    """A validation relation that involves two strategy settings."""

    expression: str
    message: str


class StrategyDefinition(BaseModel):
    """A no-code strategy and the inputs needed to configure it."""

    key: StrategyKey
    name: str
    description: str
    parameters: list[StrategyParameter] = Field(default_factory=list)
    validation_rules: list[CrossFieldRule] = Field(default_factory=list)


class DatasetMetadata(BaseModel):
    """The provenance and trading-date span of a stored price dataset."""

    symbol: str
    source: MarketDataSource
    start: date
    end: date


class MarketDataBarPreview(BaseModel):
    """A JSON-safe OHLC row shown before a backtest is run."""

    date: date
    open: float
    high: float
    low: float
    close: float


class MarketDataPreview(BaseModel):
    """A newly stored dataset and a small client-facing summary."""

    dataset_id: str = Field(serialization_alias="datasetId")
    symbol: str
    start: date
    end: date
    rows: int
    preview: list[MarketDataBarPreview] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
