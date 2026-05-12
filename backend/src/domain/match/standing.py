"""Standing — Value Object for a team's group-stage standing.

DDD role: Value Object. Identity is implicit by ``team_id`` (a team
is in exactly one group during the group stage); persistence carries
an autoincrement id the domain doesn't expose. Source is Sportmonks'
``/standings/seasons/{season_id}`` projection during the live ingest.
"""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class Standing:
    team_id: str
    group: str
    position: int
    played: int
    won: int
    drawn: int
    lost: int
    goals_for: int
    goals_against: int
    goal_difference: int
    points: int


class StandingRepository(Protocol):
    async def upsert(self, standing: Standing) -> None: ...

    async def list_all(self) -> list[Standing]: ...

    async def list_by_group(self, group: str) -> list[Standing]: ...

    async def get_for_team(self, team_id: str) -> Standing | None: ...
