"""A depth limit for JSON that comes from clients.

Real payloads (messages, tool calls, OTLP attribute values) nest a handful of levels. The limit
keeps the recursive code that walks a payload far from Python's recursion limit, and
`json.loads` itself raises `RecursionError` on deeper input.
"""

from typing import Any

MAX_JSON_DEPTH = 64


def exceeds_depth(value: Any, limit: int = MAX_JSON_DEPTH) -> bool:
    """Whether `value` nests containers deeper than `limit`. Iterative, so it cannot recurse."""
    stack: list[tuple[Any, int]] = [(value, 1)]
    while stack:
        current, depth = stack.pop()
        if isinstance(current, dict):
            children: Any = current.values()
        elif isinstance(current, list):
            children = current
        else:
            continue
        if depth > limit:
            return True
        stack.extend((child, depth + 1) for child in children)
    return False
