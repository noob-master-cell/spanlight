"""Structured logging: JSON lines on stdout, with the request id bound per request."""

import logging
import sys

import structlog
from structlog.typing import EventDict, WrappedLogger

from app.core.request_context import current_request_id


def _add_request_id(_: WrappedLogger, __: str, event_dict: EventDict) -> EventDict:
    request_id = current_request_id()
    if request_id is not None:
        event_dict.setdefault("request_id", request_id)
    return event_dict


def configure_logging(level: str = "INFO", *, json: bool = True) -> None:
    shared_processors: list[structlog.typing.Processor] = [
        structlog.contextvars.merge_contextvars,
        _add_request_id,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
    ]
    renderer: structlog.typing.Processor = (
        structlog.processors.JSONRenderer() if json else structlog.dev.ConsoleRenderer()
    )

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # Route stdlib logging (uvicorn, sqlalchemy, alembic) through the same renderer.
    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.processors.format_exc_info,
            renderer,
        ],
    )
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())
    # Our middleware emits one access line per request; uvicorn's would duplicate it.
    logging.getLogger("uvicorn.access").disabled = True
