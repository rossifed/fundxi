"""Sink decorator that emits price ticks alongside event persistence.

DDD role: Adapter (driven). Wraps an inner ``LiveDataSink`` and adds
the price-emission concern as a separate component — the inner sink
keeps its single responsibility (project + upsert), this decorator
adds the second responsibility (compute delta + write tick).

For every ``MATCH_EVENT`` forwarded to the inner sink, the same
payload is re-projected (cheap pure call) and ``compute_event_delta``
is invoked for each affected player. A non-zero delta triggers one
``valuation.player_price_tick`` row, derived from the running price
in the injected ``PriceState``.

The pricing kernel (``compute_event_delta``) and the timestamp
convention (``kickoff + minute*60 + sequence``) are the exact same as
the batch ``wc_replay`` job, so the replayed curve is identical to
what a full rebuild would produce.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta

import structlog

from src.infrastructure.sportmonks.projectors.match_event import project_match_event
from src.simulation.domain.ports import LiveDataSink, PlayerPriceTickWriter
from src.simulation.domain.price_state import PriceState
from src.simulation.domain.replay_event import ReplayEvent, ReplayEventKind
from src.valuation.strategies.events_based_v0 import compute_event_delta

log = structlog.get_logger(__name__)


@dataclass(slots=True)
class PriceTickEmittingSink:
    inner: LiveDataSink
    price_ticks: PlayerPriceTickWriter
    price_state: PriceState
    fixture_kickoff: datetime
    player_id_by_sportmonks: Mapping[int, int]
    team_id_by_sportmonks: Mapping[int, str]

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
        for affected_player in {match_event.player_id, match_event.related_player_id}:
            if affected_player is None:
                continue
            delta_pct = compute_event_delta(match_event, affected_player)
            if delta_pct == 0.0:
                continue
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
                change_since_open=round(delta_pct, 2),
            )
