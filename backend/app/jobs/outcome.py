"""How a background job that ended `done` actually ended."""

import enum


class JobOutcome(enum.StrEnum):
    """What a task reports when it returns. A task that returns nothing means `OK`.

    A job that skipped its work is still `done`: retrying cannot help, because the missing
    setting or the spent budget is still missing or spent on the next attempt.
    """

    OK = "ok"
    # An optional integration the task needs (object storage, a database URL, an API key) is off.
    SKIPPED_NOT_CONFIGURED = "skipped_not_configured"
    # The task would have spent money and a cap said no.
    SKIPPED_BUDGET = "skipped_budget"

    @property
    def is_skipped(self) -> bool:
        return self is not JobOutcome.OK
