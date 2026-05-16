"""League domain.

DDD roles in this module:
- ``LeagueKind``        — Value Object (enum). GLOBAL is the implicit
  everyone-league seeded once; PRIVATE is user-created with an invite code.
- ``InviteCode``        — Value Object. 6-char uppercase alphanumeric,
  unambiguous alphabet (no O/0/I/1), generated for private leagues only.
- ``League``            — Entity (identity = id).
- ``LeaderboardEntry``  — Value Object. One ranked row, derived from a
  member's portfolio value; never persisted.
- ``LeagueRepository``  — Repository port (Protocol).

No I/O here. Portfolio valuation lives in the repository adapter (SQL),
not in the domain — the domain only describes the shapes and invariants.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Protocol

INVITE_CODE_LENGTH = 6
# Unambiguous alphabet — drops O/0 and I/1 so codes are safe to read aloud.
_INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


class LeagueKind(StrEnum):
    GLOBAL = "global"
    PRIVATE = "private"


class InvalidInviteCodeError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class InviteCode:
    value: str

    def __post_init__(self) -> None:
        if len(self.value) != INVITE_CODE_LENGTH or any(c not in _INVITE_ALPHABET for c in self.value):
            raise InvalidInviteCodeError(f"invalid invite code: {self.value!r}")

    @classmethod
    def generate(cls) -> InviteCode:
        return cls(value="".join(secrets.choice(_INVITE_ALPHABET) for _ in range(INVITE_CODE_LENGTH)))

    @classmethod
    def parse(cls, raw: str) -> InviteCode:
        return cls(value=raw.strip().upper())


@dataclass(frozen=True, slots=True)
class League:
    id: int
    name: str
    kind: LeagueKind
    invite_code: str | None  # None for GLOBAL, set for PRIVATE
    created_by: int | None  # None for GLOBAL, the creator's user_id for PRIVATE
    created_at: datetime

    @property
    def is_public(self) -> bool:
        return self.kind is LeagueKind.GLOBAL


@dataclass(frozen=True, slots=True)
class LeaderboardEntry:
    rank: int
    user_id: int
    name: str
    value: float
    return_pct: float
    is_me: bool


class LeagueRepository(Protocol):
    async def get_global(self) -> League | None: ...

    async def get_by_id(self, league_id: int) -> League | None: ...

    async def get_by_invite_code(self, code: str) -> League | None: ...

    async def create_private(self, *, name: str, created_by: int, invite_code: str) -> League: ...

    async def add_member(self, *, league_id: int, user_id: int) -> None: ...

    async def is_member(self, *, league_id: int, user_id: int) -> bool: ...

    async def list_for_user(self, user_id: int) -> list[League]: ...

    async def member_count(self, league_id: int) -> int: ...

    async def leaderboard(self, *, league_id: int, me_user_id: int) -> list[LeaderboardEntry]: ...
