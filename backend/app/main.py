from datetime import date
from io import BytesIO

import pandas as pd
from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .backtests import (
    BacktestError,
    BacktestValidationError,
    DatasetNotFoundError,
    run_backtest,
)
from .catalog import STRATEGIES
from .datasets import DatasetStore
from .market_data import MarketDataError, load_yahoo, normalize_bars
from .schemas import (
    DatasetMetadata,
    BacktestRequest,
    BacktestResponse,
    MarketDataBarPreview,
    MarketDataPreview,
    MarketDataSource,
    StrategyDefinition,
)


app = FastAPI(title="美股回测 API")
dataset_store = DatasetStore()


@app.exception_handler(RequestValidationError)
async def request_validation_error(
    _request: Request, error: RequestValidationError
) -> JSONResponse:
    fields = {
        ".".join(str(location) for location in item["loc"][1:]): "输入不合法"
        for item in error.errors()
    }
    return _validation_error(fields)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/strategies", response_model=list[StrategyDefinition])
def strategies() -> list[StrategyDefinition]:
    return STRATEGIES


@app.post("/api/backtests", response_model=BacktestResponse)
def backtest(request: BacktestRequest) -> BacktestResponse | JSONResponse:
    try:
        return run_backtest(dataset_store, request)
    except DatasetNotFoundError:
        return JSONResponse(
            status_code=404,
            content={
                "code": "DATASET_NOT_FOUND",
                "message": "未找到数据集，请重新加载行情数据",
                "fields": {},
            },
        )
    except BacktestValidationError as error:
        return _validation_error(error.fields)
    except BacktestError as error:
        return JSONResponse(
            status_code=400,
            content={"code": "BACKTEST_ERROR", "message": str(error), "fields": {}},
        )


@app.post("/api/market-data/preview", response_model=MarketDataPreview)
async def preview_market_data(
    source: MarketDataSource = Form(...),
    file: UploadFile | None = File(default=None),
    symbol: str | None = Form(default=None),
    start: date | None = Form(default=None),
    end: date | None = Form(default=None),
) -> MarketDataPreview | JSONResponse:
    if source == "csv":
        if file is None:
            return _validation_error({"file": "请上传 CSV 文件"})
        try:
            bars = normalize_bars(pd.read_csv(BytesIO(await file.read())))
        except pd.errors.EmptyDataError:
            return _validation_error({"file": "CSV 文件不能为空"})
        except (pd.errors.ParserError, UnicodeDecodeError):
            return _validation_error({"file": "CSV 文件格式或编码无效"})
        except MarketDataError as error:
            return _validation_error({"file": str(error)})
        normalized_symbol = (
            symbol.strip().upper()
            if symbol and symbol.strip()
            else (file.filename or "CSV").rsplit(".", maxsplit=1)[0].upper()
        )
    else:
        if not symbol or not symbol.strip():
            return _validation_error({"symbol": "请输入股票代码"})
        if start is None or end is None:
            return _validation_error({"start": "请输入开始和结束日期"})
        if start > end:
            return _validation_error({"end": "结束日期不能早于开始日期"})
        try:
            bars = load_yahoo(symbol, start, end)
        except MarketDataError as error:
            return JSONResponse(
                status_code=400,
                content={"code": "MARKET_DATA_ERROR", "message": str(error), "fields": {}},
            )
        normalized_symbol = symbol.strip().upper()

    first_date = bars.index[0].date()
    last_date = bars.index[-1].date()
    dataset_id = dataset_store.put(
        bars,
        DatasetMetadata(
            symbol=normalized_symbol,
            source=source,
            start=first_date,
            end=last_date,
        ),
    )
    return MarketDataPreview(
        dataset_id=dataset_id,
        symbol=normalized_symbol,
        start=first_date,
        end=last_date,
        rows=len(bars),
        preview=[
            MarketDataBarPreview(
                date=index.date(),
                open=row.Open,
                high=row.High,
                low=row.Low,
                close=row.Close,
            )
            for index, row in bars.head().iterrows()
        ],
        warnings=[],
    )


def _validation_error(fields: dict[str, str]) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"code": "VALIDATION_ERROR", "message": "请求参数无效", "fields": fields},
    )
