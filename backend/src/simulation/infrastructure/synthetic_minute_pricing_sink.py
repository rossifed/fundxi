"""Replay pricing sink — per-minute synthetic rating → canonical kernel.

DDD role: Adapter (driven), decorates the inner ``LiveDataSink``.
The sole price-tick producer on the replay path.

WC2022 has no real per-minute rating (only end-state pulls exist), so a
replay cannot drive Model A from real data. This sink fabricates a
plausible minute-by-minute rating (bounded mean-reverting walk; only
the *timing* of the replayed events is real → a goal nudges the
scorer's synthetic rating that minute) and runs it through THE
canonical kernel every game-minute, for the whole roster — so the
match narrative plays (inner ProjectorSink) AND prices move richly
every minute, exactly what the live poller will do for real in June.

Synthetic ⇒ every tick is tagged ``source = "rehearsal"`` (never
``"engine"``): filterable, purgeable, never mistaken for real. Tracked
as a debt in the project memory file. Same kernel as the live poller
→ live and replay cannot diverge in logic, only in input provenance.
"""

import json
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from random import Random

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.valuation.player_valuation import ValuationSource
from src.infrastructure.db.price_tick_writer import upsert_price_tick
from src.infrastructure.sportmonks.projectors.match_event import project_match_event
from src.simulation.domain.ports import LiveDataSink
from src.simulation.domain.replay_event import ReplayEvent, ReplayEventKind
from src.simulation.domain.synthetic_rating import event_bump, next_rating
from src.valuation.pricing import PriceSnapshot
from src.valuation.pricing import price as kernel_price
from src.valuation.strategies.layered_v1 import TeamRosters

log = structlog.get_logger(__name__)


@dataclass(slots=True)
class SyntheticMinutePricingSink:
    inner: LiveDataSink
    session: AsyncSession
    publisher: object  # NotificationPublisher (publish(subject, bytes)); bus is best-effort
    rosters: TeamRosters
    base_price_by_player: Mapping[int, float]
    fixture_kickoff: datetime
    player_id_by_sportmonks: Mapping[int, int]
    team_id_by_sportmonks: Mapping[int, str]
    seed: int = 1337
    _rng: Random = field(init=False)
    _rating: dict[int, float] = field(default_factory=dict)
    _bumps: dict[int, float] = field(default_factory=dict)
    _last_minute: int | None = field(default=None)

    def __post_init__(self) -> None:
        self._rng = Random(self.seed)

    def _roster(self) -> list[int]:
        return [pid for players in self.rosters.by_team.values() for pid, _ in players]

    async def emit(self, event: ReplayEvent, *, fixture_internal_id: int) -> None:
        # Project the event first (narrative plays), then react.
        await self.inner.emit(event, fixture_internal_id=fixture_internal_id)
        if self._last_minute is not None and event.minute != self._last_minute:
            await self._price_minute(self._last_minute, fixture_internal_id)
        if event.kind is ReplayEventKind.MATCH_EVENT:
            self._accumulate_bump(event, fixture_internal_id)
        self._last_minute = event.minute

    def _accumulate_bump(self, event: ReplayEvent, fixture_internal_id: int) -> None:
        try:
            match_event, _ = project_match_event(
                dict(event.payload),
                fixture_id=fixture_internal_id,
                player_id_by_sportmonks=dict(self.player_id_by_sportmonks),
                team_id_by_sportmonks=dict(self.team_id_by_sportmonks),
            )
        except (ValueError, TypeError):
            return
        if match_event.player_id is None:
            return
        bump = event_bump(match_event.type.value)
        if bump != 0.0:
            self._bumps[match_event.player_id] = self._bumps.get(match_event.player_id, 0.0) + bump

    async def finalize(self, fixture_internal_id: int) -> None:
        """Price the final minute (no later event triggers its boundary)."""
        if self._last_minute is not None:
            await self._price_minute(self._last_minute, fixture_internal_id)

    async def _price_minute(self, minute: int, fixture_internal_id: int) -> None:
        ts = self.fixture_kickoff + timedelta(minutes=minute)
        for pid in self._roster():
            base = self.base_price_by_player.get(pid)
            if base is None:
                continue
            rating = next_rating(self._rating.get(pid, 6.0), rng=self._rng, bump=self._bumps.get(pid, 0.0))
            self._rating[pid] = rating
            result = kernel_price(base, 0.0, PriceSnapshot(rating=rating, is_live=True))
            await upsert_price_tick(
                self.session,
                player_id=pid,
                ts=ts,
                fixture_id=fixture_internal_id,
                current_price=result.price,
                performance_rating=round(rating, 2),
                source=ValuationSource.REHEARSAL.value,
            )
            await self._publish(pid, fixture_internal_id, result.price)
        # Bucketed portfolio-value snapshot for every holder of any
        # player priced this minute. The snapshot bucket is WALL-CLOCK
        # now() — a portfolio's value history lives on the user's real
        # timeline, NOT the match's simulated 2022 clock (`ts` above is
        # fixture_kickoff + minute, used only for the player tick rows).
        from src.application.portfolio_snapshot_service import PortfolioSnapshotService
        pvs_service = PortfolioSnapshotService.from_session(self.session)
        await pvs_service.materialize_for_player_ticks(
            ticked_player_ids=self._roster(),
            ts=datetime.now(UTC),
        )
        self._bumps = {}

    async def _publish(self, player_id: int, fixture_id: int, price: float) -> None:
        payload = json.dumps(
            {
                "kind": "player_price_tick",
                "player_id": player_id,
                "fixture_id": fixture_id,
                "current_price": price,
            }
        ).encode()
        try:
            await self.publisher.publish(f"fundxi.player_price_tick.{player_id}", payload)  # type: ignore[attr-defined]
        except Exception as exc:
            log.debug("simulation.synthetic_pricing.publish_failed", error=str(exc))
