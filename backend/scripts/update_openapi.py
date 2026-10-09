"""Regenerate `backend/openapi.json`, the committed snapshot of the HTTP contract.

Run from `backend/` after an intended API change, then commit the diff:

    uv run python scripts/update_openapi.py

`tests/api/test_openapi_snapshot.py` fails whenever the app and the snapshot disagree, and it
imports `build_app` and `render_openapi` from here so both always render the same way.
"""

import json
import sys
from pathlib import Path

from fastapi import FastAPI

from app.config import Settings
from app.main import create_app

SNAPSHOT_PATH = Path(__file__).resolve().parent.parent / "openapi.json"
UPDATE_COMMAND = "uv run python scripts/update_openapi.py"


def build_app() -> FastAPI:
    """The app with fixed settings, so the rendered document never depends on the environment.

    The gateway routes (`/gw/v1/*`) are mounted only with `GATEWAY_MODE=embedded`, so the mode
    is pinned to it: the document always describes them. The other settings are pinned too, so
    a local `.env` or a stray variable never produces a snapshot that differs from CI's.
    """
    settings = Settings(
        gateway_mode="embedded",
        sentry_dsn=None,
        anthropic_api_key=None,
        demo_enabled=False,
        log_level="WARNING",
        log_json=False,
        _env_file=None,
    )
    return create_app(settings)


def render_openapi(app: FastAPI) -> str:
    """The exact text of the snapshot file: stable key order, two-space indent, final newline."""
    return json.dumps(app.openapi(), indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main() -> int:
    try:
        SNAPSHOT_PATH.write_text(render_openapi(build_app()), encoding="utf-8", newline="\n")
    except Exception as exc:  # noqa: BLE001 - a script reports any failure and exits non-zero
        print(f"Could not write {SNAPSHOT_PATH}: {exc!r}", file=sys.stderr)
        return 1
    print(f"Wrote {SNAPSHOT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
