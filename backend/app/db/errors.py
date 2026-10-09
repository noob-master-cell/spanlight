"""Reading what a database error is about."""

from sqlalchemy.exc import IntegrityError


def violated_constraint(error: IntegrityError) -> str | None:
    """The constraint (or unique index) a database error is about, if the driver says."""
    name = getattr(getattr(error.orig, "diag", None), "constraint_name", None)
    return name if isinstance(name, str) else None
