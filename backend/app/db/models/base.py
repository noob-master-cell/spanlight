"""Declarative base and helpers shared by every model module."""

import enum

from sqlalchemy import Enum
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


def _pg_enum(enum_class: type[enum.StrEnum], name: str) -> Enum:
    return Enum(
        enum_class,
        name=name,
        values_callable=lambda members: [member.value for member in members],
        create_type=False,
    )
