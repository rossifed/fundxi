"""Lineup domain — Entity (one row per player per fixture).

DDD roles:
- Lineup: Entity (sportmonks-sourced; identity = id assigned by DB).
- LineupRole: Value Object (enum) — starter or bench.
"""

from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol


class LineupRole(StrEnum):
    STARTER = "starter"
    BENCH = "bench"


@dataclass(frozen=True, slots=True)
class Lineup:
    id: int
    fixture_id: int
    player_id: int
    team_id: str
    role: LineupRole
    position: str  # GK / DF / MF / FW (matches Position enum value)
    jersey_number: int | None
    formation_position: int | None  # 1..11 slot or None for bench
    formation_field: str | None  # Sportmonks "row:col" tactical grid (e.g. "2:3")


class LineupRepository(Protocol):
    async def upsert_by_sportmonks_id(self, lineup: Lineup, *, sportmonks_id: int) -> None: ...

    async def list_by_fixture(self, fixture_id: int) -> list[Lineup]: ...
