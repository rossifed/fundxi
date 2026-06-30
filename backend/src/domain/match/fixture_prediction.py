"""FixturePrediction — a fixture's frozen pre-match result probabilities.

DDD role: Value Object + Repository port. The probabilities (home/draw/away win,
as fractions summing to 1) are the provider's "market price" for the match; the
odds-based knockout settlement reads them to scale each side's reward/penalty by
how (un)likely its result was.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class FixturePrediction:
    """Home/draw/away win probabilities (fractions in [0,1], sum ≈ 1)."""

    fixture_id: int
    p_home: float
    p_draw: float
    p_away: float


class FixturePredictionRepository(Protocol):
    async def upsert(self, prediction: FixturePrediction, *, source: str) -> None:
        """Insert or refresh the fixture's probabilities. Called only while the
        fixture is upcoming, so the last pre-kickoff write is the frozen value."""
        ...

    async def get_by_fixture_id(self, fixture_id: int) -> FixturePrediction | None: ...
