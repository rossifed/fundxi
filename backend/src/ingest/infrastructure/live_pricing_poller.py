"""LivePricingPoller — incremental price-tick generator.

DDD role: Adapter (driven) implementing the ``Poller`` Protocol. A
singleton side worker that, every ``pricing_poll_seconds``, drains
the newly-ingested ``core.match_event`` rows (those with id beyond
the persisted watermark) into ``valuation.player_price_tick`` rows,
using the v0 events-based kernel — the same ``compute_event_delta``
the batch ``wc_replay`` job uses, so the live curve reproduces what
a full rebuild would produce.

State:
  - ``current_price_by_player`` is seeded on startup from each
    player's latest tick (falling back to the deterministic synthetic
    base value) and mutated multiplicatively as events are processed.
  - the watermark (highest processed event id) is read from
    ``valuation.pricing_progress`` on startup and bumped in the SAME
    transaction as the ticks it produces — a crash mid-batch never
    double-counts on restart.

For every impacted player a ``fundxi.player_price_tick.<player_id>``
notification is published after commit so the streaming layer can
push the new price to open browsers.

Not yet implemented: the "clean-game bonus" tick at FT (wc_replay
applies it for starters with no negative events). Add it later as a
reaction to the ``fundxi.fixture_status`` notification.
"""

import asyncio
import json
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.match.match_event import MatchEvent
from src.domain.valuation.player_valuation import ValuationSource
from src.infrastructure.db.models.fixture import FixtureORM
from src.infrastructure.db.models.player import PlayerORM
from src.infrastructure.db.models.player_price_tick import PlayerPriceTickORM
from src.infrastructure.db.price_tick_writer import upsert_price_tick
from src.infrastructure.db.repositories.match_event import SqlAlchemyMatchEventRepository
from src.infrastructure.db.repositories.pricing_progress import SqlAlchemyPricingProgressRepository
from src.infrastructure.valuation.synthetic_valuation_provider import synthesize_valuation
from src.ingest.application.commit_then_publish import commit_then_publish
from src.ingest.domain.live_pricing_state import LivePricingState
from src.ingest.domain.ports import NotificationPublisher
from src.valuation.strategies.events_based_v0 import compute_event_delta

log = structlog.get_logger(__name__)

_DEFAULT_BASE_PRICE = 50.0  # fallback if a player somehow has neither tick nor synth seed


@dataclass(slots=True)
class LivePricingPoller:
    poll_seconds: float
    publisher: NotificationPublisher
    session_factory: Callable[[], AsyncSession]
    _state: LivePricingState | None = None
    _kickoff_by_fixture: dict[int, datetime] | None = None

    async def run(self) -> None:
        log.info("ingest.pricing.start", poll_seconds=self.poll_seconds)
        await self._bootstrap_state()
        try:
            while True:
                await self.poll_once()
                await asyncio.sleep(self.poll_seconds)
        except asyncio.CancelledError:
            log.info("ingest.pricing.stop")
            raise

    # --- startup --------------------------------------------------------

    async def _bootstrap_state(self) -> None:
        async with self.session_factory() as session:
            prices = await self._load_current_prices(session)
            watermark = await SqlAlchemyPricingProgressRepository(session).get_last_event_id()
            self._kickoff_by_fixture = await self._load_kickoffs(session)
        self._state = LivePricingState(current_price_by_player=prices, last_event_id=watermark)
        log.info(
            "ingest.pricing.state_loaded",
            players=len(prices),
            watermark=watermark,
            fixtures=len(self._kickoff_by_fixture or {}),
        )

    async def _load_current_prices(self, session: AsyncSession) -> dict[int, float]:
        # Latest tick per player.
        latest_subq = (
            select(PlayerPriceTickORM.player_id, PlayerPriceTickORM.current_price)
            .distinct(PlayerPriceTickORM.player_id)
            .order_by(PlayerPriceTickORM.player_id, PlayerPriceTickORM.ts.desc())
        )
        latest = {row.player_id: float(row.current_price) for row in (await session.execute(latest_subq)).all()}

        # Seed every player; overlay the latest tick where it exists.
        seed_at = datetime.now(UTC)
        prices: dict[int, float] = {}
        for (player_id,) in (await session.execute(select(PlayerORM.id))).all():
            prices[player_id] = latest.get(player_id) or _safe_base_value(player_id, seed_at)
        return prices

    async def _load_kickoffs(self, session: AsyncSession) -> dict[int, datetime]:
        rows = (
            await session.execute(
                select(FixtureORM.id, FixtureORM.kickoff_at).where(FixtureORM.kickoff_at.is_not(None))
            )
        ).all()
        return {row.id: row.kickoff_at for row in rows if row.kickoff_at is not None}

    # --- per-tick processing -------------------------------------------

    async def poll_once(self) -> None:
        if self._state is None or self._kickoff_by_fixture is None:
            await self._bootstrap_state()
        assert self._state is not None and self._kickoff_by_fixture is not None
        state = self._state

        async with self.session_factory() as session:
            try:
                events = await SqlAlchemyMatchEventRepository(session).list_since_id(state.last_event_id)
            except Exception as exc:
                log.warning("ingest.pricing.read_failed", error=str(exc))
                return
            if not events:
                return

            notifications, ticks_emitted = await self._process(session=session, events=events)
            new_watermark = max(e.id for e in events)
            await SqlAlchemyPricingProgressRepository(session).set_last_event_id(new_watermark)

            try:
                await commit_then_publish(session=session, publisher=self.publisher, notifications=notifications)
            except Exception as exc:
                log.warning("ingest.pricing.commit_failed", error=str(exc))
                await session.rollback()
                return

        state.last_event_id = new_watermark
        log.info("ingest.pricing.tick", events=len(events), ticks=ticks_emitted, watermark=new_watermark)

    async def _process(
        self, *, session: AsyncSession, events: Sequence[MatchEvent]
    ) -> tuple[list[tuple[str, bytes]], int]:
        assert self._state is not None and self._kickoff_by_fixture is not None
        state = self._state
        kickoffs = self._kickoff_by_fixture
        notifications: list[tuple[str, bytes]] = []
        ticks_emitted = 0
        seed_at = datetime.now(UTC)

        for event in events:
            kickoff = kickoffs.get(event.fixture_id)
            if kickoff is None:
                # Fixture has no kickoff (shouldn't happen) — skip pricing for it.
                continue
            ts = kickoff + timedelta(minutes=event.minute, seconds=event.sequence)
            for affected in {event.player_id, event.related_player_id}:
                if affected is None:
                    continue
                delta_pct = compute_event_delta(event, affected)
                if delta_pct == 0.0:
                    continue
                if affected not in state.current_price_by_player:
                    state.current_price_by_player[affected] = _safe_base_value(affected, seed_at)
                new_price = state.apply_delta(affected, delta_pct)
                await upsert_price_tick(
                    session,
                    player_id=affected,
                    ts=ts,
                    fixture_id=event.fixture_id,
                    current_price=new_price,
                    performance_rating=round(6.5 + delta_pct / 4.0, 2),
                    change_since_open=round(delta_pct, 2),
                    source=ValuationSource.ENGINE.value,
                )
                notifications.append(
                    (
                        f"fundxi.player_price_tick.{affected}",
                        json.dumps(
                            {
                                "kind": "player_price_tick",
                                "player_id": affected,
                                "fixture_id": event.fixture_id,
                                "current_price": new_price,
                                "change_since_open": round(delta_pct, 2),
                            }
                        ).encode(),
                    )
                )
                ticks_emitted += 1
        return notifications, ticks_emitted


def _safe_base_value(player_id: int, as_of: datetime) -> float:
    try:
        return synthesize_valuation(player_id, as_of=as_of).base_value
    except Exception as exc:  # defensive; the synthetic seed should never raise
        log.warning("ingest.pricing.synth_seed_failed", player_id=player_id, error=str(exc))
        return _DEFAULT_BASE_PRICE
