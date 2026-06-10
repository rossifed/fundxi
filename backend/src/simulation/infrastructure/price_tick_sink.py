"""Sink decorator that emits price ticks alongside event persistence.

DDD role: Adapter (driven). Wraps an inner ``LiveDataSink`` and adds
the price-emission concern as a separate component — the inner sink
keeps its single responsibility (project + upsert), this decorator
adds the second responsibility (compute delta + write tick).

For every ``MATCH_EVENT`` forwarded to the inner sink, the same
payload is re-projected (cheap pure call) and the SHARED pricing
kernel ``per_event_deltas`` is invoked. It returns every
(player, delta) the event produces — L1 event + L5 substitution +
L4 team propagation (the same kernel ``wc_replay`` uses), so the
replayed curve is identical to a full batch rebuild. One non-zero
delta → one ``valuation.player_price_tick`` row, derived from the
running price in the injected ``PriceState``.

The timestamp convention (``kickoff + minute*60 + sequence``) is the
exact same as the batch job.
"""

from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import structlog

from src.infrastructure.sportmonks.projectors.match_event import project_match_event
from src.simulation.domain.ports import LiveDataSink, PlayerPriceTickWriter
from src.simulation.domain.price_state import PriceState
from src.simulation.domain.replay_event import ReplayEvent, ReplayEventKind
from src.valuation.strategies.layered_v1 import TeamRosters, per_event_deltas

log = structlog.get_logger(__name__)


@dataclass(slots=True)
class PriceTickEmittingSink:
    inner: LiveDataSink
    price_ticks: PlayerPriceTickWriter
    price_state: PriceState
    fixture_kickoff: datetime
    player_id_by_sportmonks: Mapping[int, int]
    team_id_by_sportmonks: Mapping[int, str]
    # Per-team rosters for layer-4 team propagation. None ⇒ no lineup
    # context (propagation skipped, kernel still does L1 + L5).
    rosters: TeamRosters | None = None
    # Optional post-batch hook: receives the list of ticked players + ts
    # so the caller can materialise portfolio-value snapshots in the
    # same transaction. ``None`` ⇒ snapshot writing is skipped (tests,
    # standalone runs that don't need the portfolio side-effect).
    snapshot_materializer: Callable[[list[int], datetime], Awaitable[None]] | None = None

    async def emit(self, event: ReplayEvent, *, fixture_internal_id: int) -> None:
        # Persist the event first so any reader observes "event arrived,
        # then price reacted" in chronological order.
        await self.inner.emit(event, fixture_internal_id=fixture_internal_id)
        if event.kind is not ReplayEventKind.MATCH_EVENT:
            return
        try:
            match_event, _ = project_match_event(
                dict(event.payload),
                fixture_id=fixture_internal_id,
                player_id_by_sportmonks=dict(self.player_id_by_sportmonks),
                team_id_by_sportmonks=dict(self.team_id_by_sportmonks),
            )
        except (ValueError, TypeError) as exc:
            # The inner sink has already logged & skipped this payload;
            # mirror the decision so we don't react to a non-event.
            log.debug("simulation.price_tick.skip", reason=str(exc))
            return

        ts = self.fixture_kickoff + timedelta(minutes=match_event.minute, seconds=match_event.sequence)
        ticked_players: list[int] = []
        for affected_player, delta_pct in per_event_deltas(match_event, rosters=self.rosters):
            try:
                new_price = self.price_state.update(affected_player, delta_pct)
            except KeyError:
                # Player not in the price book (e.g. transfer between
                # roster snapshot and event). Skip rather than crash.
                log.warning("simulation.price_tick.unknown_player", player_id=affected_player)
                continue
            await self.price_ticks.insert(
                player_id=affected_player,
                ts=ts,
                fixture_id=fixture_internal_id,
                current_price=new_price,
                performance_rating=round(6.5 + delta_pct / 4.0, 2),
            )
            ticked_players.append(affected_player)
        if ticked_players and self.snapshot_materializer is not None:
            # Portfolio snapshots are bucketed on the WALL CLOCK, not the
            # match's simulated 2022 ``ts`` — a user's value history lives
            # on their real timeline.
            await self.snapshot_materializer(ticked_players, datetime.now(UTC))
