"""Test helpers: an in-memory ingestion API that records what the SDK sends."""

from __future__ import annotations

import gzip
import json
import threading
from collections.abc import Callable
from typing import Any

import httpx

import spanlight

Handler = Callable[[httpx.Request], httpx.Response]


def accept_all(request: httpx.Request) -> httpx.Response:
    body = decode_body(request)
    return httpx.Response(200, json={"accepted": len(body["spans"]), "rejected": []})


def decode_body(request: httpx.Request) -> dict[str, Any]:
    raw = request.content
    if request.headers.get("Content-Encoding") == "gzip":
        raw = gzip.decompress(raw)
    return json.loads(raw)


class FakeIngestApi:
    """Records every ``POST /v1/traces`` request; the response is configurable."""

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.handler: Handler = accept_all
        self._lock = threading.Lock()

    def __call__(self, request: httpx.Request) -> httpx.Response:
        with self._lock:
            self.requests.append(request)
        return self.handler(request)

    @property
    def batches(self) -> list[list[dict[str, Any]]]:
        with self._lock:
            return [decode_body(request)["spans"] for request in self.requests]

    @property
    def spans(self) -> list[dict[str, Any]]:
        return [span for batch in self.batches for span in batch]

    def span_named(self, name: str) -> dict[str, Any]:
        matches = [span for span in self.spans if span["name"] == name]
        assert len(matches) == 1, f"expected one span named {name!r}, got {len(matches)}"
        return matches[0]

    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self)


def flushed_spans(tracer: spanlight.Spanlight, ingest: FakeIngestApi) -> list[dict[str, Any]]:
    assert tracer.flush(timeout=5), "flush timed out"
    return ingest.spans
