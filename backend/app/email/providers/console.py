"""The console provider: for development and tests, where nothing should leave the machine.

It always logs the recipient and the subject. When given a file it also appends the whole
message to it as one JSON line, so a developer or an end-to-end test can read the verification
link out of the file. The body is never logged: links in it are credentials, and log lines are
shipped and kept.
"""

import asyncio
import json
import os
import threading
from datetime import UTC, datetime
from pathlib import Path

import structlog

from app.email.message import EmailMessage

logger = structlog.get_logger(__name__)

# One lock for the process: the writes run in worker threads, and a long line is not guaranteed
# to reach the file in one piece, so two concurrent sends could otherwise interleave.
_WRITE_LOCK = threading.Lock()


class ConsoleEmailSender:
    def __init__(self, path: Path | None) -> None:
        self._path = path

    async def send(self, message: EmailMessage) -> None:
        if self._path is not None:
            line = json.dumps(
                {
                    "sent_at": datetime.now(UTC).isoformat(),
                    "to": message.to,
                    "subject": message.subject,
                    "text": message.text,
                    "html": message.html,
                }
            )
            await asyncio.to_thread(_append_line, self._path, line)
        logger.info(
            "email_console", to=message.to, subject=message.subject, written=self._path is not None
        )


def _append_line(path: Path, line: str) -> None:
    # The file holds links that sign someone in, so it is created readable by its owner only.
    # A missing directory raises on purpose: a sink the operator asked for must not fail quietly.
    with _WRITE_LOCK:
        descriptor = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
        with os.fdopen(descriptor, "a", encoding="utf-8") as sink:
            sink.write(line + "\n")
