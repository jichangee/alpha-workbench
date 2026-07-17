from fastapi import FastAPI

from .catalog import STRATEGIES
from .schemas import StrategyDefinition


app = FastAPI(title="美股回测 API")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/strategies", response_model=list[StrategyDefinition])
def strategies() -> list[StrategyDefinition]:
    return STRATEGIES
