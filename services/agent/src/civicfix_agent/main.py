import hmac
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, status

from civicfix_agent.config import get_settings
from civicfix_agent.logging_config import configure_logging
from civicfix_agent.run_service import (
    ApprovalInput,
    RunInput,
    RunService,
    create_run_service,
)

settings = get_settings()
configure_logging(settings.log_level)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    logger.info('agent service started')
    with create_run_service(settings.checkpoint_db) as run_service:
        app.state.run_service = run_service
        yield
    logger.info('agent service stopped')


app = FastAPI(title='CivicFix Agent', version='0.1.0', lifespan=lifespan)


def require_run_secret(
    secret: Annotated[str | None, Header(alias='X-Agent-Secret')] = None,
) -> None:
    if not settings.run_secret or not secret or not hmac.compare_digest(secret, settings.run_secret):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Unauthorized')


def get_run_service() -> RunService:
    return app.state.run_service


@app.get('/health')
async def health() -> dict[str, str]:
    return {'status': 'ok'}


@app.post('/run', dependencies=[Depends(require_run_secret)])
async def start_run(
    payload: RunInput,
    service: Annotated[RunService, Depends(get_run_service)],
) -> dict[str, str]:
    return {'run_id': service.start(payload)}


@app.get('/runs/{run_id}', dependencies=[Depends(require_run_secret)])
async def get_run(
    run_id: str,
    service: Annotated[RunService, Depends(get_run_service)],
) -> dict[str, object]:
    try:
        return service.get(run_id)
    except KeyError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Run not found') from error


@app.post('/runs/{run_id}/resume', dependencies=[Depends(require_run_secret)])
async def resume_run(
    run_id: str,
    payload: ApprovalInput,
    service: Annotated[RunService, Depends(get_run_service)],
) -> dict[str, object]:
    try:
        return service.resume(run_id, payload)
    except (KeyError, ValueError) as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Run not found') from error