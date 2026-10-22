from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from langgraph.checkpoint.sqlite import SqliteSaver
from pydantic import BaseModel, ConfigDict, Field

from civicfix_agent.graph import build_complaint_graph


class RunInput(BaseModel):
    model_config = ConfigDict(extra='forbid')

    photo_url: str = Field(min_length=1)
    coords: tuple[float, float]
    description: str = Field(min_length=1)
    geocoded_address: dict[str, str | None] | None = None
    report_date: str | None = None


class ApprovalInput(BaseModel):
    model_config = ConfigDict(extra='forbid')

    approval: str = Field(min_length=1)


class RunService:
    def __init__(self, checkpointer: SqliteSaver) -> None:
        self.graph = build_complaint_graph(checkpointer=checkpointer)

    def start(self, payload: RunInput) -> str:
        run_id = str(uuid.uuid4())
        self.graph.invoke(
            payload.model_dump(),
            {'configurable': {'thread_id': run_id}},
        )
        return run_id

    def get(self, run_id: str) -> dict[str, Any]:
        snapshot = self.graph.get_state({'configurable': {'thread_id': run_id}})
        if not snapshot.config:
            raise KeyError(run_id)
        values = _jsonable(snapshot.values)
        if values.get('needs_input'):
            status = 'needs_input'
        elif snapshot.next:
            status = 'awaiting_approval' if snapshot.next == ('await_approval',) else 'running'
        else:
            status = 'completed'
        return {'run_id': run_id, 'status': status, 'state': values}

    def resume(self, run_id: str, payload: ApprovalInput) -> dict[str, Any]:
        config = {'configurable': {'thread_id': run_id}}
        self.graph.get_state(config)
        self.graph.update_state(config, {'approval': payload.approval})
        result = self.graph.invoke(None, config)
        return self.get(run_id) | {'state': _jsonable(result)}


@contextmanager
def create_run_service(database_path: str) -> Iterator[RunService]:
    path = Path(database_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with SqliteSaver.from_conn_string(str(path)) as checkpointer:
        checkpointer.setup()
        yield RunService(checkpointer)


def _jsonable(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump(mode='json')
    if isinstance(value, dict):
        return {key: _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    return value
