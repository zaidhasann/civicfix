from __future__ import annotations

import logging
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from langgraph.checkpoint.sqlite import SqliteSaver
from pydantic import BaseModel, ConfigDict, Field

from civicfix_agent.config import Settings
from civicfix_agent.geocode import Geocoder, create_geocoder
from civicfix_agent.graph import build_complaint_graph
from civicfix_agent.vector_store import VectorStore, create_vector_store
from civicfix_agent.vision import LLMClient, VisionLLMClient

logger = logging.getLogger(__name__)


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
    def __init__(
        self,
        checkpointer: SqliteSaver,
        llm_client: LLMClient | None = None,
        vector_store: VectorStore | None = None,
        geocoder: Geocoder | None = None,
    ) -> None:
        self.geocoder = geocoder
        self.graph = build_complaint_graph(
            checkpointer=checkpointer,
            llm_client=llm_client,
            vector_store=vector_store,
        )

    def start(self, payload: RunInput) -> str:
        run_id = str(uuid.uuid4())
        if payload.geocoded_address is None and self.geocoder is not None:
            try:
                payload.geocoded_address = self.geocoder.reverse(*payload.coords)
            except (OSError, RuntimeError, TimeoutError, ValueError) as error:
                logger.warning('reverse geocoding failed', extra={'error': str(error)})
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
def create_run_service(
    database_path: str,
    *,
    settings: Settings | None = None,
    llm_client: LLMClient | None = None,
    vector_store: VectorStore | None = None,
    geocoder: Geocoder | None = None,
) -> Iterator[RunService]:
    created_clients: list[object] = []
    if settings is not None:
        if llm_client is None and settings.llm_api_key:
            llm_client = VisionLLMClient(settings)
            created_clients.append(llm_client)
        if vector_store is None:
            vector_store = create_vector_store()
            created_clients.append(vector_store)
        if geocoder is None:
            geocoder = create_geocoder(settings)
            created_clients.append(geocoder)

    path = Path(database_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with SqliteSaver.from_conn_string(str(path)) as checkpointer:
            checkpointer.setup()
            yield RunService(checkpointer, llm_client, vector_store, geocoder)
    finally:
        for client in reversed(created_clients):
            close = getattr(client, 'close', None)
            if callable(close):
                close()


def _jsonable(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump(mode='json')
    if isinstance(value, dict):
        return {key: _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    return value
