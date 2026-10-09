"""Streaming passthrough: forward upstream bytes unchanged while an observer reads copies.

The stream idle timeout is enforced by the caller, not here.
"""

import contextlib
from collections.abc import AsyncIterator, Callable

import structlog

from app.gateway.sse import FrameTooLarge, SseState, StreamObserver, parse_frames

logger = structlog.get_logger(__name__)


async def observe_stream(
    upstream: AsyncIterator[bytes],
    observer: StreamObserver,
    on_first_chunk: Callable[[], None],
) -> AsyncIterator[bytes]:
    """Yield the upstream bytes unchanged while the observer reads copies.

    ``on_first_chunk`` runs once, before the first chunk is yielded. If the consumer stops
    early (disconnect, cancellation) the upstream iterator is closed and the exception
    propagates. Observing never breaks the passthrough: an observer or callback failure is
    logged, and a frame over the size limit detaches the observer (its summary keeps what it
    had) while the bytes keep flowing.
    """
    state = SseState()
    first = True
    observing = True
    try:
        async for chunk in upstream:
            if first:
                first = False
                _safely(on_first_chunk)
            if observing:
                try:
                    for frame in parse_frames(chunk, state):
                        observer.on_frame(frame)
                except FrameTooLarge:
                    observing = False
                    state.buffer.clear()
                    logger.warning("gateway.stream_observer_detached", reason="frame_too_large")
                except Exception:  # observing must never break the passthrough
                    observing = False
                    state.buffer.clear()
                    logger.warning("gateway.stream_observer_failed", exc_info=True)
            yield chunk
    finally:
        aclose = getattr(upstream, "aclose", None)
        if aclose is not None:
            with contextlib.suppress(Exception):
                await aclose()


def _safely(callback: Callable[[], None]) -> None:
    try:
        callback()
    except Exception:
        logger.warning("gateway.stream_callback_failed", exc_info=True)
