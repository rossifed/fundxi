"""PlayerMatchStat — Value Object for per-player per-match statistics.

DDD role: Value Object. Identity is implicit by ``(player_id, fixture_id)``;
persistence carries an autoincrement id we don't expose at the domain
layer. Source is Sportmonks' ``?include=lineups.statistics`` projection
during the live ingest.
"""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class PlayerMatchStat:
    player_id: int
    fixture_id: int
    minutes_played: int | None = None
    shots_total: int | None = None
    shots_on_target: int | None = None
    goals: int | None = None
    assists: int | None = None
    yellow_cards: int | None = None
    red_cards: int | None = None
    key_passes: int | None = None
    passes_total: int | None = None
    passes_accuracy: float | None = None
    rating: float | None = None
    # Expected Goals (Sportmonks type_id 5304). Primary input of the Layer-2
    # continuous term in the pricing kernel; None ⇒ the term degrades to
    # shots/key-passes (never fabricates xG).
    xg: float | None = None


class PlayerMatchStatRepository(Protocol):
    async def upsert(self, stat: PlayerMatchStat, *, raw_details: dict[str, object] | None = None) -> None: ...

    async def list_by_fixture(self, fixture_id: int) -> list[PlayerMatchStat]: ...

    async def list_by_player(self, player_id: int, *, limit: int = 50) -> list[PlayerMatchStat]: ...
