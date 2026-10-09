"""OTLP/HTTP trace export → native span format.

Both encodings (protobuf and JSON) are first decoded into `OtlpSpan`, then a
single mapping turns OpenTelemetry GenAI semantic-convention attributes into
the native `SpanIn` shape, so they flow through the same pipeline as SDK data.
"""

import base64
import binascii
import json
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any

from google.protobuf.message import DecodeError
from opentelemetry.proto.collector.trace.v1.trace_service_pb2 import (
    ExportTracePartialSuccess,
    ExportTraceServiceRequest,
    ExportTraceServiceResponse,
)
from opentelemetry.proto.common.v1.common_pb2 import AnyValue, KeyValue

from app.ingest.jsondepth import exceeds_depth

_STATUS_BY_CODE = {0: "unset", 1: "ok", 2: "error"}
_SPAN_KIND_CLIENT = 3

_CONTENT_INPUT_KEYS = ("gen_ai.input.messages", "gen_ai.prompt")
_CONTENT_OUTPUT_KEYS = ("gen_ai.output.messages", "gen_ai.completion")
_CONTENT_KEYS = frozenset(_CONTENT_INPUT_KEYS + _CONTENT_OUTPUT_KEYS)


class OtlpDecodeError(ValueError):
    pass


@dataclass(frozen=True)
class OtlpSpan:
    trace_id: str
    span_id: str
    parent_span_id: str | None
    name: str
    kind: int
    start_unix_nano: int
    end_unix_nano: int
    status_code: int
    status_message: str | None
    attributes: dict[str, Any]
    resource: dict[str, Any]


# --- protobuf -----------------------------------------------------------------


def decode_protobuf(body: bytes) -> list[OtlpSpan]:
    request = ExportTraceServiceRequest()
    try:
        request.ParseFromString(body)
    except DecodeError as exc:
        raise OtlpDecodeError("body is not a valid ExportTraceServiceRequest") from exc

    spans: list[OtlpSpan] = []
    for resource_spans in request.resource_spans:
        resource = _proto_attributes(resource_spans.resource.attributes)
        for scope_spans in resource_spans.scope_spans:
            for span in scope_spans.spans:
                spans.append(
                    OtlpSpan(
                        trace_id=span.trace_id.hex(),
                        span_id=span.span_id.hex(),
                        parent_span_id=span.parent_span_id.hex() or None,
                        name=span.name,
                        kind=span.kind,
                        start_unix_nano=span.start_time_unix_nano,
                        end_unix_nano=span.end_time_unix_nano,
                        status_code=span.status.code,
                        status_message=span.status.message or None,
                        attributes=_proto_attributes(span.attributes),
                        resource=resource,
                    )
                )
    return spans


def _proto_attributes(entries: Iterable[KeyValue]) -> dict[str, Any]:
    return {entry.key: _proto_value(entry.value) for entry in entries}


def _proto_value(value: AnyValue) -> Any:
    kind = value.WhichOneof("value")
    if kind == "string_value":
        return value.string_value
    if kind == "bool_value":
        return value.bool_value
    if kind == "int_value":
        return value.int_value
    if kind == "double_value":
        return value.double_value
    if kind == "array_value":
        return [_proto_value(item) for item in value.array_value.values]
    if kind == "kvlist_value":
        return _proto_attributes(value.kvlist_value.values)
    if kind == "bytes_value":
        return base64.b64encode(value.bytes_value).decode()
    return None


def encode_protobuf_response(rejected: int, message: str | None) -> bytes:
    response = ExportTraceServiceResponse()
    if rejected:
        response.partial_success.CopyFrom(
            ExportTracePartialSuccess(rejected_spans=rejected, error_message=message or "")
        )
    serialized: bytes = response.SerializeToString()
    return serialized


# --- JSON ---------------------------------------------------------------------


def decode_json(document: Any) -> list[OtlpSpan]:
    """Decode OTLP/JSON (lowerCamelCase keys, hex-encoded ids, int64 as strings)."""
    if not isinstance(document, dict):
        raise OtlpDecodeError("body must be a JSON object")

    spans: list[OtlpSpan] = []
    for resource_spans in _list(document, "resourceSpans", "resource_spans"):
        resource_obj = _dict(resource_spans, "resource")
        resource = _json_attributes(_list(resource_obj, "attributes"))
        for scope_spans in _list(resource_spans, "scopeSpans", "scope_spans"):
            for span in _list(scope_spans, "spans"):
                spans.append(_decode_json_span(span, resource))
    return spans


def _decode_json_span(span: Any, resource: dict[str, Any]) -> OtlpSpan:
    if not isinstance(span, dict):
        raise OtlpDecodeError("each span must be a JSON object")
    status = _dict(span, "status")
    parent = _json_id(_get(span, "parentSpanId", "parent_span_id"), size=8)
    return OtlpSpan(
        trace_id=_json_id(_get(span, "traceId", "trace_id"), size=16) or "",
        span_id=_json_id(_get(span, "spanId", "span_id"), size=8) or "",
        parent_span_id=parent or None,
        name=str(_get(span, "name") or ""),
        kind=_json_int(_get(span, "kind"), default=0),
        start_unix_nano=_json_int(_get(span, "startTimeUnixNano", "start_time_unix_nano")),
        end_unix_nano=_json_int(_get(span, "endTimeUnixNano", "end_time_unix_nano")),
        status_code=_json_status_code(_get(status, "code")),
        status_message=_get(status, "message") or None,
        attributes=_json_attributes(_list(span, "attributes")),
        resource=resource,
    )


def _get(obj: Mapping[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in obj:
            return obj[key]
    return None


def _dict(obj: Mapping[str, Any], *keys: str) -> dict[str, Any]:
    value = _get(obj, *keys)
    return value if isinstance(value, dict) else {}


def _list(obj: Mapping[str, Any], *keys: str) -> list[Any]:
    value = _get(obj, *keys)
    return value if isinstance(value, list) else []


def _json_int(value: Any, *, default: int = 0) -> int:
    if value is None:
        return default
    if isinstance(value, bool):
        raise OtlpDecodeError("expected an integer")
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.lstrip("-").isdigit():
        return int(value)
    if isinstance(value, str):
        # Enum fields may be sent by name, e.g. "SPAN_KIND_CLIENT".
        return _ENUM_NAMES.get(value, default)
    raise OtlpDecodeError("expected an integer")


_ENUM_NAMES = {
    "SPAN_KIND_UNSPECIFIED": 0,
    "SPAN_KIND_INTERNAL": 1,
    "SPAN_KIND_SERVER": 2,
    "SPAN_KIND_CLIENT": 3,
    "SPAN_KIND_PRODUCER": 4,
    "SPAN_KIND_CONSUMER": 5,
    "STATUS_CODE_UNSET": 0,
    "STATUS_CODE_OK": 1,
    "STATUS_CODE_ERROR": 2,
}


def _json_status_code(value: Any) -> int:
    return _json_int(value, default=0)


def _json_id(value: Any, *, size: int) -> str | None:
    """OTLP/JSON ids are hex; some exporters send base64, which we also accept."""
    if not value or not isinstance(value, str):
        return None
    if len(value) == size * 2:
        try:
            bytes.fromhex(value)
        except ValueError:
            pass
        else:
            return value.lower()
    try:
        decoded = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError):
        return value  # left for span validation to reject with a clear reason
    return decoded.hex() if len(decoded) == size else value


def _json_attributes(entries: list[Any]) -> dict[str, Any]:
    attributes: dict[str, Any] = {}
    for entry in entries:
        if isinstance(entry, dict) and isinstance(entry.get("key"), str):
            attributes[entry["key"]] = _json_value(entry.get("value"))
    return attributes


def _json_value(value: Any) -> Any:
    if not isinstance(value, dict):
        return None
    if "stringValue" in value:
        return value["stringValue"]
    if "boolValue" in value:
        return bool(value["boolValue"])
    if "intValue" in value:
        return _json_int(value["intValue"])
    if "doubleValue" in value:
        return float(value["doubleValue"])
    if "arrayValue" in value:
        return [_json_value(item) for item in _list(value["arrayValue"], "values")]
    if "kvlistValue" in value:
        return _json_attributes(_list(value["kvlistValue"], "values"))
    if "bytesValue" in value:
        return value["bytesValue"]
    return None


def json_response(rejected: int, message: str | None) -> dict[str, Any]:
    if not rejected:
        return {}
    return {"partialSuccess": {"rejectedSpans": str(rejected), "errorMessage": message or ""}}


# --- mapping ------------------------------------------------------------------


def to_native_spans(spans: list[OtlpSpan]) -> list[dict[str, Any]]:
    return [to_native_span(span) for span in spans]


def to_native_span(span: OtlpSpan) -> dict[str, Any]:
    """Map one OTLP span onto the native ingestion shape (validated later)."""
    attributes = span.attributes
    resource = span.resource

    def first(*keys: str, source: Mapping[str, Any] = attributes) -> Any:
        for key in keys:
            value = source.get(key)
            if value is not None and value != "":
                return value
        return None

    is_llm = any(key.startswith("gen_ai.") for key in attributes)
    service_name = first("service.name", source=resource)
    is_root = span.parent_span_id is None

    return {
        "trace_id": span.trace_id,
        "span_id": span.span_id,
        "parent_span_id": span.parent_span_id,
        "name": span.name or (str(service_name) if service_name else "span"),
        "kind": "llm" if is_llm else _infer_kind(span),
        "status": _STATUS_BY_CODE.get(span.status_code, "unset"),
        "status_message": span.status_message,
        "start_time": span.start_unix_nano,
        "end_time": span.end_unix_nano,
        "provider": _as_text(first("gen_ai.provider.name", "gen_ai.system")),
        # The response model is the concrete snapshot that was billed.
        "model": _as_text(first("gen_ai.response.model", "gen_ai.request.model")),
        "usage": {
            "input_tokens": first("gen_ai.usage.input_tokens", "gen_ai.usage.prompt_tokens"),
            "output_tokens": first("gen_ai.usage.output_tokens", "gen_ai.usage.completion_tokens"),
            "cached_tokens": first("gen_ai.usage.cache_read_input_tokens"),
        },
        "input": _content(first(*_CONTENT_INPUT_KEYS)),
        "output": _content(first(*_CONTENT_OUTPUT_KEYS)),
        "attributes": _stored_attributes(attributes, service_name),
        "trace": {
            # Only the root span names the trace; service.name is the fallback.
            "name": (span.name or _as_text(service_name)) if is_root else None,
            "environment": _as_text(
                first("deployment.environment.name", "deployment.environment", source=resource)
            ),
            "release": _as_text(first("service.version", source=resource)),
            "user_id": _as_text(first("user.id") or first("user.id", source=resource)),
            "session_id": _as_text(first("session.id") or first("session.id", source=resource)),
        },
    }


def _infer_kind(span: OtlpSpan) -> str:
    keys = span.attributes.keys()
    if any(key.startswith(("http.", "url.")) for key in keys) and span.kind == _SPAN_KIND_CLIENT:
        return "http"
    if any(key.startswith("db.") for key in keys):
        return "retrieval"
    return "other"


def _as_text(value: Any) -> str | None:
    if value is None:
        return None
    return value if isinstance(value, str) else str(value)


def _content(value: Any) -> Any:
    """GenAI content attributes are usually JSON encoded into a string.

    A string that is not JSON, or nests deeper than `MAX_JSON_DEPTH`, is kept as it is.
    """
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except (json.JSONDecodeError, RecursionError):
            return value
        return value if exceeds_depth(parsed) else parsed
    return value


def _stored_attributes(attributes: Mapping[str, Any], service_name: Any) -> dict[str, Any]:
    stored = {key: value for key, value in attributes.items() if key not in _CONTENT_KEYS}
    if service_name is not None:
        stored.setdefault("service.name", service_name)
    return stored
