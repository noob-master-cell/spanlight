"""What the channel service raises. The API maps each to a problem response (`api/v1/alerts.py`).

Messages never quote a secret. `RecipientNotMemberError` names the refused addresses, which the
caller sent and, as an admin of the organization, can see in its member list anyway.
"""


class ChannelNotFoundError(Exception):
    """No channel with this id in the organization (or the organization is gone)."""


class ChannelNameTakenError(Exception):
    """Another channel in the organization already has this name."""


class ChannelLimitError(Exception):
    """The organization already has the most channels it may have."""

    def __init__(self, limit: int) -> None:
        super().__init__(f"an organization can have at most {limit} alert channels")
        self.limit = limit


class RecipientNotMemberError(Exception):
    """An email recipient is not a current member of the organization with a verified email."""

    def __init__(self, addresses: list[str]) -> None:
        super().__init__(f"{len(addresses)} recipient(s) are not verified members")
        self.addresses = addresses


class EmailNotConfiguredError(Exception):
    """An email channel was tested while no email provider is configured."""
