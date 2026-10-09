"""Run the standalone gateway: `python -m app.gateway`.

Serves `app.main.create_gateway_app` (`/gw/v1/*`, `/health/*`, `/metrics`) with uvicorn, from
the same image as the api. Run the api with `GATEWAY_MODE=standalone` next to it and point
Caddy's `GATEWAY_UPSTREAM` here. `PORT` (default 8001) and `GATEWAY_HOST` (default all
interfaces, as in the container) choose where it listens.
"""

import os

import uvicorn

DEFAULT_PORT = 8001


def main() -> None:
    # The migration role's URL is for `spanlight migrate` only; the api's image command drops
    # it the same way, so no request-serving process holds the owner credentials.
    os.environ.pop("MIGRATION_DATABASE_URL", None)
    uvicorn.run(
        "app.main:create_gateway_app",
        factory=True,
        # A blank variable means unset, as for every setting.
        host=os.environ.get("GATEWAY_HOST") or "0.0.0.0",  # noqa: S104 - the container's interface
        port=int(os.environ.get("PORT") or DEFAULT_PORT),
        # Behind Caddy, like the api: the client address comes from X-Forwarded-For.
        proxy_headers=True,
        forwarded_allow_ips="*",
    )


if __name__ == "__main__":
    main()
