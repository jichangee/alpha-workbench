from __future__ import annotations

from dataclasses import dataclass
from uuid import uuid4

import pandas as pd

from .schemas import DatasetMetadata


@dataclass
class _Dataset:
    frame: pd.DataFrame
    metadata: DatasetMetadata


class DatasetStore:
    """An in-memory registry that protects datasets from caller mutation."""

    def __init__(self) -> None:
        self._datasets: dict[str, _Dataset] = {}

    def put(self, frame: pd.DataFrame, metadata: DatasetMetadata) -> str:
        dataset_id = str(uuid4())
        self._datasets[dataset_id] = _Dataset(
            frame=frame.copy(deep=True),
            metadata=metadata.model_copy(deep=True),
        )
        return dataset_id

    def get(self, dataset_id: str) -> pd.DataFrame:
        return self._datasets[dataset_id].frame.copy(deep=True)
