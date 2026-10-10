"""What the rule and event services raise. The API maps each to a problem response
(`api/v1/alert_rules.py`, `api/v1/alert_events.py`)."""

import uuid


class RuleNotFoundError(Exception):
    """No rule with this id that people manage in the project (budget rules count as missing)."""


class EventNotFoundError(Exception):
    """No alert event with this id in the project."""


class RuleLimitError(Exception):
    """The project already has the most rules it may have."""

    def __init__(self, limit: int) -> None:
        super().__init__(f"a project can have at most {limit} alert rules")
        self.limit = limit


class UnknownChannelError(Exception):
    """A rule names channels that are not channels of the project's organization."""

    def __init__(self, channel_ids: list[uuid.UUID]) -> None:
        super().__init__(f"{len(channel_ids)} channel(s) are not channels of the organization")
        self.channel_ids = channel_ids


class InvalidMuteError(Exception):
    """A mute end that is not in the future or is too far ahead. The message says which."""


class AlreadyAcknowledgedError(Exception):
    """The event was acknowledged before."""
