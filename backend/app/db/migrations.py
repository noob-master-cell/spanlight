"""Helpers for inspecting and applying Alembic migrations."""

from functools import lru_cache
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

from alembic import command

ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"


def alembic_config(database_url: str | None = None) -> Config:
    config = Config(str(ALEMBIC_INI))
    if database_url is not None:
        config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
    return config


@lru_cache
def head_revision() -> str | None:
    return ScriptDirectory.from_config(alembic_config()).get_current_head()


def upgrade_to_head(database_url: str) -> None:
    command.upgrade(alembic_config(database_url), "head")


def downgrade_to(database_url: str, revision: str) -> None:
    command.downgrade(alembic_config(database_url), revision)
