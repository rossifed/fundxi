"""User domain — Aggregate Root for app.user.

DDD role: Entity (identity = id). The mono-user v0 has a single 'human'
user auto-created at bootstrap. Bots will be added in M5.4 with kind='bot'.
"""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Protocol


class UserKind(StrEnum):
    HUMAN = "human"
    BOT = "bot"


@dataclass(frozen=True, slots=True)
class User:
    id: int
    name: str
    kind: UserKind
    strategy: str | None  # populated for bots; None for humans
    created_at: datetime


class UserRepository(Protocol):
    async def get_default_human(self) -> User | None: ...

    async def get_by_id(self, user_id: int) -> User | None: ...

    async def list_bots(self) -> list[User]: ...

    async def create(self, *, name: str, kind: UserKind, strategy: str | None = None) -> User: ...
