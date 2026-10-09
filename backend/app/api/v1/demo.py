"""`POST /api/v1/demo/session`: sign in as the shared, read-only demo visitor."""

from fastapi import APIRouter, Request, Response

from app.api.deps import ANONYMOUS, DbSession, SettingsDep, client_ip, utcnow
from app.api.schemas import UserOut
from app.api.v1.auth import set_auth_cookies
from app.core.errors import not_found
from app.core.ratelimit import DEMO_LIMITER, enforce_rate_limit
from app.db.models import User
from app.services.demo import ensure_demo_workspace
from app.services.sessions import DEMO_ABSOLUTE_LIFETIME, create_session

router = APIRouter(prefix="/demo", tags=["demo"])


@router.post("/session", response_model=UserOut, dependencies=ANONYMOUS)
async def start_demo_session(
    request: Request, response: Response, db: DbSession, settings: SettingsDep
) -> User:
    if not settings.is_demo_enabled:
        raise not_found("The live demo is not enabled on this instance.")

    ip = client_ip(request)
    await enforce_rate_limit(
        request,
        DEMO_LIMITER,
        f"demo:ip:{ip or 'unknown'}",
        scope="demo",
        detail="Too many demo sessions from this address.",
    )

    now = utcnow()
    workspace = await ensure_demo_workspace(db)
    issued = await create_session(
        db,
        workspace.user.id,
        now=now,
        ip=ip,
        user_agent=request.headers.get("user-agent"),
        absolute_lifetime=DEMO_ABSOLUTE_LIFETIME,
    )
    await db.commit()
    set_auth_cookies(response, settings, issued.token, max_age=DEMO_ABSOLUTE_LIFETIME)
    return workspace.user
