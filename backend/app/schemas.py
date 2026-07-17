from typing import Literal

from pydantic import BaseModel, Field


StrategyKey = Literal["buy_hold", "sma_cross", "rsi_reversal", "donchian"]
ParameterType = Literal["integer", "number"]


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
