"""The alert channels a project's critical insights go to (`projects.insight_channel_ids`)."""

import uuid
from collections.abc import Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from app.alerts.rules_queries import org_channel_ids
from app.core.errors import FieldError, ProblemError


async def check_insight_channels(
    db: AsyncSession, org_id: uuid.UUID, channel_ids: Sequence[uuid.UUID]
) -> None:
    """Every id is an alert channel of the organization, or `422 UNKNOWN_CHANNEL`."""
    known = await org_channel_ids(db, org_id, channel_ids)
    unknown = [channel_id for channel_id in channel_ids if channel_id not in known]
    if unknown:
        listed = ", ".join(str(channel_id) for channel_id in unknown)
        raise ProblemError(
            422,
            "UNKNOWN_CHANNEL",
            "A project's insights can only notify channels of its organization.",
            errors=[
                FieldError(field="insight_channel_ids", message=f"Not a channel here: {listed}")
            ],
        )
