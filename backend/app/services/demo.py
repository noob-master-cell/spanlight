"""The public demo workspace: a demo org, its project and a read-only demo user.

Demo visitors all share the demo user (a viewer), so they can explore real
traces produced by the `demo_traffic` job but cannot change anything.
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ids import new_id
from app.core.security import UNUSABLE_PASSWORD_HASH
from app.db.models import Membership, MembershipRole, Organization, Project, User

DEMO_ORG_SLUG = "demo"
DEMO_ORG_NAME = "Demo"
DEMO_PROJECT_SLUG = "support-bot"
DEMO_PROJECT_NAME = "Support bot"
DEMO_USER_EMAIL = "demo@demo.spanlight.dev"
DEMO_USER_NAME = "Demo visitor"


def is_demo_user(user: User) -> bool:
    """Whether this is the shared demo account: anonymous, so nobody may mail it or reset it."""
    return user.email.lower() == DEMO_USER_EMAIL


@dataclass(frozen=True)
class DemoWorkspace:
    org: Organization
    project: Project
    user: User


async def ensure_demo_workspace(db: AsyncSession) -> DemoWorkspace:
    """Create the demo org, project, user and membership if missing. Idempotent.

    Uses INSERT … ON CONFLICT DO NOTHING so concurrent callers (the API and
    the worker) cannot race each other into a unique violation. The caller
    commits.
    """
    await db.execute(
        insert(Organization)
        .values(id=new_id(), name=DEMO_ORG_NAME, slug=DEMO_ORG_SLUG, is_demo=True)
        .on_conflict_do_nothing(index_elements=[Organization.slug])
    )
    org = (await db.scalars(select(Organization).where(Organization.slug == DEMO_ORG_SLUG))).one()

    await db.execute(
        insert(Project)
        .values(id=new_id(), org_id=org.id, name=DEMO_PROJECT_NAME, slug=DEMO_PROJECT_SLUG)
        .on_conflict_do_nothing(index_elements=[Project.org_id, Project.slug])
    )
    project = (
        await db.scalars(
            select(Project).where(Project.org_id == org.id, Project.slug == DEMO_PROJECT_SLUG)
        )
    ).one()

    await db.execute(
        insert(User)
        .values(
            id=new_id(),
            email=DEMO_USER_EMAIL,
            password_hash=UNUSABLE_PASSWORD_HASH,
            name=DEMO_USER_NAME,
        )
        .on_conflict_do_nothing(index_elements=[User.email])
    )
    user = (await db.scalars(select(User).where(User.email == DEMO_USER_EMAIL))).one()

    await db.execute(
        insert(Membership)
        .values(org_id=org.id, user_id=user.id, role=MembershipRole.VIEWER)
        .on_conflict_do_nothing(index_elements=[Membership.org_id, Membership.user_id])
    )
    return DemoWorkspace(org=org, project=project, user=user)
