"""What the budget service raises. The API maps each to a problem response
(`api/v1/budgets.py`). A channel outside the organization raises the rules' own
`app.alerts.rule_errors.UnknownChannelError`."""


class BudgetNotFoundError(Exception):
    """No budget with this id in the project."""


class BudgetLimitError(Exception):
    """The project already has the most budgets it may have."""

    def __init__(self, limit: int) -> None:
        super().__init__(f"a project can have at most {limit} budgets")
        self.limit = limit


class BudgetNameTakenError(Exception):
    """Another budget of the project has this name."""


class UnknownScopeError(Exception):
    """A `gateway_key` budget names something that is not a gateway key of the project."""
