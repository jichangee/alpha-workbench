from datetime import date
from math import isfinite
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


StrategyKey = Literal["buy_hold", "sma_cross", "rsi_reversal", "donchian"]
ParameterType = Literal["integer", "number"]
MarketDataSource = Literal["yahoo", "csv"]
PositionMode = Literal["cash", "rotate"]


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


class BacktestRequest(BaseModel):
    """The configuration needed to execute a stored market-data dataset."""

    model_config = ConfigDict(populate_by_name=True, allow_inf_nan=False)

    datasetId: str
    positionMode: PositionMode = "cash"
    alternateDatasetId: str | None = None
    strategy: StrategyConfig
    initialCash: float = 100000
    commission: float = 0
    slippageBps: float = 5

    @model_validator(mode="after")
    def rotation_requires_an_alternate_dataset(self) -> "BacktestRequest":
        if self.positionMode == "rotate" and not self.alternateDatasetId:
            raise ValueError("换仓模式必须提供替代股票数据集")
        return self

    @field_validator("initialCash")
    @classmethod
    def initial_cash_must_be_positive(cls, value: float) -> float:
        if not isfinite(value) or value <= 0:
            raise ValueError("初始资金必须是有限正数")
        return value

    @field_validator("commission")
    @classmethod
    def commission_must_be_non_negative(cls, value: float) -> float:
        if not isfinite(value) or value < 0:
            raise ValueError("佣金必须是有限非负数")
        return value

    @field_validator("slippageBps")
    @classmethod
    def slippage_must_be_in_range(cls, value: float) -> float:
        if not isfinite(value) or not 0 <= value < 10_000:
            raise ValueError("滑点基点必须在 0（含）到 10000（不含）之间")
        return value


class BacktestMetadata(BaseModel):
    dataset_id: str = Field(serialization_alias="datasetId")
    strategy_key: StrategyKey = Field(serialization_alias="strategyKey")
    start: date
    end: date
    execution: Literal["first_open_then_next_open"]
    position_mode: PositionMode = Field(serialization_alias="positionMode")
    primary_symbol: str = Field(serialization_alias="primarySymbol")
    alternate_symbol: str | None = Field(serialization_alias="alternateSymbol")
    warmup: int
    initial_cash: float = Field(serialization_alias="initialCash")
    commission: float
    slippage_bps: float = Field(serialization_alias="slippageBps")


class BacktestMetrics(BaseModel):
    ending_equity: float = Field(serialization_alias="endingEquity")
    total_return: float | None = Field(serialization_alias="totalReturn")
    cagr: float | None
    annualized_volatility: float | None = Field(serialization_alias="annualizedVolatility")
    sharpe_ratio: float | None = Field(serialization_alias="sharpeRatio")
    max_drawdown: float | None = Field(serialization_alias="maxDrawdown")
    trade_count: int = Field(serialization_alias="tradeCount")
    win_rate: float | None = Field(serialization_alias="winRate")


class BacktestSeries(BaseModel):
    dates: list[date]
    open: list[float | None]
    high: list[float | None]
    low: list[float | None]
    close: list[float | None]
    cash: list[float | None]
    shares: list[int | None]
    holdings: list[float | None]
    equity: list[float | None]
    strategy: list[float | None]
    benchmark: list[float | None]
    drawdown: list[float | None]
    benchmark_drawdown: list[float | None] = Field(
        serialization_alias="benchmarkDrawdown"
    )
    position_symbol: list[str | None] = Field(serialization_alias="positionSymbol")


class BacktestFill(BaseModel):
    date: date
    symbol: str
    side: Literal["buy", "sell"]
    price: float
    shares: int
    commission: float
    notional: float


class BacktestTrade(BaseModel):
    symbol: str
    entry_date: date = Field(serialization_alias="entryDate")
    entry_price: float = Field(serialization_alias="entryPrice")
    shares: int
    exit_date: date | None = Field(serialization_alias="exitDate")
    exit_price: float | None = Field(serialization_alias="exitPrice")
    gross_pnl: float | None = Field(serialization_alias="grossPnl")
    costs: float
    net_pnl: float | None = Field(serialization_alias="netPnl")
    return_pct: float | None = Field(serialization_alias="returnPct")
    is_open: bool = Field(serialization_alias="isOpen")


class BacktestResponse(BaseModel):
    metadata: BacktestMetadata
    metrics: BacktestMetrics
    series: BacktestSeries
    indicators: dict[str, list[float | None]] = Field(default_factory=dict)
    fills: list[BacktestFill] = Field(default_factory=list)
    trades: list[BacktestTrade] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class PortfolioPosition(BaseModel):
    """One symbol and its fraction of a portfolio's initial value."""

    model_config = ConfigDict(str_strip_whitespace=True, allow_inf_nan=False)

    symbol: str = Field(min_length=1, max_length=15)
    weight: float = Field(gt=0)

    @field_validator("symbol")
    @classmethod
    def normalize_symbol(cls, value: str) -> str:
        return value.upper()


class PortfolioDefinition(BaseModel):
    """An initial allocation that will be held without rebalancing."""

    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=40)
    positions: list[PortfolioPosition] = Field(min_length=1, max_length=8)

    @model_validator(mode="after")
    def validate_positions(self) -> "PortfolioDefinition":
        symbols = [position.symbol for position in self.positions]
        if len(symbols) != len(set(symbols)):
            raise ValueError("同一持仓不能重复添加股票")
        if abs(sum(position.weight for position in self.positions) - 1) > 1e-6:
            raise ValueError("每组持仓权重合计必须为 100%")
        return self


class PortfolioComparisonRequest(BaseModel):
    """Two to five portfolios and the requested Yahoo history range."""

    start: date
    end: date
    portfolios: list[PortfolioDefinition] = Field(min_length=2, max_length=5)

    @model_validator(mode="after")
    def validate_dates(self) -> "PortfolioComparisonRequest":
        if self.start > self.end:
            raise ValueError("结束日期不能早于开始日期")
        if self.end > date.today():
            raise ValueError("结束日期不能晚于今天")
        return self


class PortfolioComparisonMetrics(BaseModel):
    total_return: float | None = Field(serialization_alias="totalReturn")
    cagr: float | None
    annualized_volatility: float | None = Field(
        serialization_alias="annualizedVolatility"
    )
    max_drawdown: float | None = Field(serialization_alias="maxDrawdown")


class PortfolioComparisonSeries(BaseModel):
    name: str
    positions: list[PortfolioPosition]
    equity: list[float]
    metrics: PortfolioComparisonMetrics


class PortfolioComparisonResponse(BaseModel):
    start: date
    end: date
    dates: list[date]
    portfolios: list[PortfolioComparisonSeries]
