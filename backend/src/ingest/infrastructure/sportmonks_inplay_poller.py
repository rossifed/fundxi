"""Real inplay poller targeting Sportmonks.

DDD role: Adapter (driven) implementing the ``Poller`` Protocol. One
instance per active fixture. Loop:

  1. Open a fresh AsyncSession (so connection lifetime stays short).
  2. ``GET /fixtures/{smk_id}?include=events.type;comments`` via the
     shared Sportmonks client.
  3. Archive the raw response (idempotent on response_hash).
  4. Project events and comments through the **same** functions the
     batch bootstrap uses — replay & live share the projection layer.
  5. Commit the DB transaction, then publish notifications on NATS in
     parallel via ``commit_then_publish``.
  6. Sleep ``poll_seconds``.

Errors (HTTP, DB, projection) are logged and swallowed: the next tick
retries. Cancellation propagates cleanly via ``asyncio.CancelledError``.
"""

import asyncio
import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.apply_did_not_play import apply_did_not_play
from src.application.apply_lineup_drops import apply_lineup_drops
from src.application.apply_suspensions import apply_suspensions
from src.application.bootstrap import bootstrap_player_stats
from src.application.reconcile_var_disallowed_goals import reconcile_var_disallowed_goals
from src.application.settle_fixture import settle_fixture
from src.application.sync_fixture_events import sync_fixture_events
from src.domain.match.fixture import Fixture, FixtureStatus
from src.domain.match.fixture_prediction import FixturePrediction
from src.domain.match.player_match_stat import PlayerMatchStat
from src.infrastructure.db.price_tick_writer import upsert_price_tick
from src.infrastructure.db.repositories.fixture import SqlAlchemyFixtureRepository
from src.infrastructure.db.repositories.fixture_prediction import SqlAlchemyFixturePredictionRepository
from src.infrastructure.db.repositories.lineup import SqlAlchemyLineupRepository
from src.infrastructure.db.repositories.match_comment import SqlAlchemyMatchCommentRepository
from src.infrastructure.db.repositories.match_event import SqlAlchemyMatchEventRepository
from src.infrastructure.db.repositories.player import SqlAlchemyPlayerRepository
from src.infrastructure.db.repositories.player_match_stat import SqlAlchemyPlayerMatchStatRepository
from src.infrastructure.db.repositories.player_tournament_stat import SqlAlchemyPlayerTournamentStatRepository
from src.infrastructure.db.repositories.portfolio_snapshot_adapters import SqlAlchemyLatestPriceProvider
from src.infrastructure.db.repositories.raw_sportmonks_event import SqlAlchemyRawSportmonksEventRepository
from src.infrastructure.db.repositories.team_match_stat import SqlAlchemyTeamMatchStatRepository
from src.infrastructure.sportmonks.client import SportmonksClient, SportmonksError
from src.infrastructure.sportmonks.projectors.fixture import (
    penalty_shootout_winner,
    project_fixture,
    project_fixture_prediction,
    project_fixture_state,
)
from src.infrastructure.sportmonks.projectors.lineup import project_lineup
from src.infrastructure.sportmonks.projectors.match_comment import project_match_comment
from src.infrastructure.sportmonks.projectors.player_match_stat import project_player_match_stat
from src.infrastructure.sportmonks.projectors.team_match_stat import project_team_match_stats
from src.infrastructure.valuation.db_or_synthetic_starting_price_provider import (
    DbOrSyntheticStartingPriceProvider,
)
from src.ingest.application.commit_then_publish import commit_then_publish
from src.ingest.domain.ports import NotificationPublisher
from src.ingest.infrastructure.sportmonks_id_maps import SportmonksIdMaps
from src.valuation.coefficients import PricingCoefficients, current_coefficients
from src.valuation.pricing import price_from_carried
from src.valuation.snapshot import build_snapshot
from src.valuation.tournament import Side

log = structlog.get_logger(__name__)

# State + scores + participants come back by default with /fixtures/{id}
# in v3, but listing them explicitly makes the contract self-documenting
# and lets us add fields without ambiguity later.
_INPLAY_INCLUDE = (
    "state;participants;scores;periods;events.type;comments;lineups.position;lineups.details;statistics.type;predictions"
)

# Subject prefix every per-player price tick is published under (live, settlement,
# suspension, lineup-drop — all share it). Used both to build the live ticks'
# subjects and to recover the set of ticked players for the portfolio-value
# snapshot at the end of a poll.
_PRICE_TICK_SUBJECT_PREFIX = "fundxi.player_price_tick."


def _ticked_player_ids_from(notifications: list[tuple[str, bytes]]) -> set[int]:
    """The set of players whose price ticked this poll, recovered from the
    price-tick notification subjects (``fundxi.player_price_tick.<player_id>``).
    Pure — covers every tick source (live, settlement, suspension, lineup-drop)
    since they all publish under the same prefix; ignores non-price subjects."""
    return {
        int(subject.rsplit(".", 1)[1])
        for subject, _ in notifications
        if subject.startswith(_PRICE_TICK_SUBJECT_PREFIX)
    }


@dataclass(slots=True)
class SportmonksInplayPoller:
    fixture_internal_id: int
    fixture_sportmonks_id: int
    poll_seconds: float
    client: SportmonksClient
    publisher: NotificationPublisher
    session_factory: Callable[[], AsyncSession]
    id_maps: SportmonksIdMaps
    # Stabilization window after full-time before we settle the result. Sportmonks
    # finalizes late events (a 90'+ red) and the final ratings for up to ~10 min
    # after the whistle; settling on the FIRST finished poll banks a premature,
    # incomplete result (e.g. misses a stoppage-time sending-off → no suspension).
    # We wait this long, still ticking live so the final rating is captured, then
    # settle once on stable data. Overridable per deployment.
    settle_grace_seconds: float = 420.0
    # Set once the fixture's full-time result has been settled, so the result
    # event (win / qualif / elimination) is applied exactly once even though the
    # poller keeps ticking through the post-FT window. The DB guard in
    # ``settle_fixture`` backs this up across a poller restart.
    _settled: bool = False
    # When the fixture was FIRST observed FINISHED — anchors the grace window.
    _finished_since: datetime | None = None
    # Set once the starting XI has been judged for drops (after the first
    # complete-XI poll, or once the match is no longer upcoming): stops the
    # pre-kickoff lineup-drop check from recomputing every poll.
    _lineup_processed: bool = False

    async def run(self) -> None:
        log.info(
            "ingest.inplay.start",
            fixture_internal_id=self.fixture_internal_id,
            fixture_sportmonks_id=self.fixture_sportmonks_id,
            poll_seconds=self.poll_seconds,
        )
        try:
            while True:
                await self.poll_once()
                await asyncio.sleep(self.poll_seconds)
        except asyncio.CancelledError:
            log.info("ingest.inplay.stop", fixture_internal_id=self.fixture_internal_id)
            await self._settle_on_shutdown()
            raise

    async def _settle_on_shutdown(self) -> None:
        """Last-chance settlement when the poller is cancelled after full-time but
        before the grace window elapsed — without it that match would never settle
        (no more polls come). Best-effort: any failure is logged, never masks the
        cancellation (a re-cancellation mid-flight propagates as CancelledError)."""
        if self._settled:
            return
        try:
            async with self.session_factory() as session:
                fixture = await SqlAlchemyFixtureRepository(session).get_by_id(self.fixture_internal_id)
                if fixture is None or fixture.status is not FixtureStatus.FINISHED:
                    return
                notifications = await self._run_settlement(
                    session=session,
                    scores_payload=None,
                    ts=datetime.now(UTC),
                    coefficients=current_coefficients(),
                )
                await commit_then_publish(session=session, publisher=self.publisher, notifications=notifications)
                await self._materialize_value_snapshots(_ticked_player_ids_from(notifications))
        except Exception as exc:
            log.warning(
                "ingest.inplay.shutdown_settle_failed",
                fixture_internal_id=self.fixture_internal_id,
                error=str(exc),
            )

    async def poll_once(self) -> None:
        endpoint = f"/fixtures/{self.fixture_sportmonks_id}"
        params = {"include": _INPLAY_INCLUDE}
        try:
            envelope = await self.client.get(endpoint, params=params)
        except (SportmonksError, httpx.HTTPError) as exc:
            log.warning(
                "ingest.inplay.fetch_failed",
                fixture_internal_id=self.fixture_internal_id,
                error=str(exc),
            )
            return

        async with self.session_factory() as session:
            try:
                await self._project_and_persist(session=session, endpoint=endpoint, params=params, envelope=envelope)
            except Exception as exc:
                log.warning(
                    "ingest.inplay.persist_failed",
                    fixture_internal_id=self.fixture_internal_id,
                    error=str(exc),
                )
                await session.rollback()

    async def _project_and_persist(
        self,
        *,
        session: AsyncSession,
        endpoint: str,
        params: dict[str, Any],
        envelope: dict[str, Any],
    ) -> None:
        raw_repo = SqlAlchemyRawSportmonksEventRepository(session)
        await raw_repo.insert_if_new(endpoint=endpoint, params=params, response=envelope)

        data = envelope.get("data")
        if not isinstance(data, dict):
            return

        lineups_payload = _array(data.get("lineups"))
        fixture = await self._project_fixture(session=session, fixture_payload=data)
        fixture_updated = fixture is not None
        # Freeze the pre-match win probability while the fixture is still upcoming
        # (last write before kick-off = the "market price" the odds-based knockout
        # settlement reads). Stops overwriting once the match is live/finished.
        await self._capture_prediction_if_upcoming(session=session, fixture=fixture, payload=data)
        events_count = await self._project_events(
            session=session,
            events_payload=_array(data.get("events")),
        )
        comments_count = await self._project_comments(
            session=session,
            comments_payload=_array(data.get("comments")),
        )
        # Retract the COMMENTARY twin of any goal annulled by VAR. The stale
        # goal EVENT is already pruned by the full-set sync above (feed absence
        # is authoritative), but the commentary line keeps its ``is_goal`` flag
        # in the comments feed — only the VAR event tells us to clear it.
        await reconcile_var_disallowed_goals(
            session,
            fixture_id=self.fixture_internal_id,
            events_payload=_array(data.get("events")),
        )
        lineups_count = await self._project_lineups(session=session, lineups_payload=lineups_payload)
        player_stats_count, curr_stats, prev_by_player = await self._project_player_match_stats(
            session=session, lineups_payload=lineups_payload
        )
        # Hot-reloadable calibration: re-read once per poll so a pricing.toml
        # edit takes effect on the next tick without restarting the worker.
        coefficients = current_coefficients()
        lineup_drop_notifs = await self._apply_lineup_drops_if_published(
            session=session, fixture=fixture, coefficients=coefficients
        )
        # Live pricing STOPS once the fixture is settled: otherwise a post-FT poll
        # would recompute base*(1+liveDelta) from the carried-in price and
        # overwrite the settlement ticks (win bonus, suspension, did-not-play),
        # silently erasing the whole result. Before settlement it keeps running so
        # the final rating is captured.
        price_notifs = (
            []
            if self._settled
            else await self._price_players(
                session=session, curr_stats=curr_stats, prev_by_player=prev_by_player, coefficients=coefficients
            )
        )
        # Full-time settlement runs AFTER live pricing so it reads each player's
        # final in-match price and applies the result event on top of it.
        settled_before = self._settled
        settlement_notifs = await self._settle_if_finished(
            session=session, fixture=fixture, scores_payload=data.get("scores"), coefficients=coefficients
        )
        team_stats_count = await self._project_team_match_stats(
            session=session, stats_payload=_array(data.get("statistics"))
        )

        fix_id = self.fixture_internal_id
        notifications: list[tuple[str, bytes]] = []
        if fixture_updated:
            notifications.append(self._notif("fixture_status", {"fixture_id": fix_id}))
        if events_count > 0:
            notifications.append(self._notif("match_event", {"fixture_id": fix_id, "count": events_count}))
        if comments_count > 0:
            notifications.append(self._notif("match_comment", {"fixture_id": fix_id, "count": comments_count}))
        if lineups_count > 0:
            notifications.append(self._notif("lineup", {"fixture_id": fix_id, "count": lineups_count}))
        if player_stats_count > 0:
            notifications.append(self._notif("player_match_stat", {"fixture_id": fix_id, "count": player_stats_count}))
        # Price ticks are notified PER PLAYER (subject keyed by player_id) so a
        # PlayerSheet subscribed to ``player:<player_id>`` actually receives
        # them; the global ``prices`` feed fans out too. (A fixture-keyed
        # subject would only reach ``player:<fixture_id>`` — i.e. nobody.)
        # Lineup-drop ticks (pre-kickoff) are per-player price ticks too.
        notifications.extend(lineup_drop_notifs)
        notifications.extend(price_notifs)
        # Settlement ticks are per-player price ticks too — same subject scheme.
        notifications.extend(settlement_notifs)
        if team_stats_count > 0:
            notifications.append(self._notif("team_match_stat", {"fixture_id": fix_id, "count": team_stats_count}))

        await commit_then_publish(session=session, publisher=self.publisher, notifications=notifications)

        # Capture the fine-grained Sportmonks state transition (HT / 2nd half / FT
        # / ...) — the granularity the coarse ``status`` discards. Its own session,
        # after the commit: a secondary projection that must NEVER break the live
        # tick (mirrors _materialize_value_snapshots). Drives the trading gate.
        await self._record_state(data=data, minute=fixture.minute if fixture is not None else None)

        # Portfolio-value snapshot for every holder of a player whose price moved
        # this poll. The ticked set is recovered from the price-tick notifications
        # just published — live, settlement, suspension AND lineup-drop ticks all
        # carry the same subject — so no source is missed. Runs AFTER the ticks
        # are committed, in its own session, and never breaks the live feed (see
        # the helper): the value history is a secondary, self-healing projection.
        await self._materialize_value_snapshots(_ticked_player_ids_from(notifications))

        # The instant a fixture settles at full-time, refresh the season-aggregate
        # stats (core.player_tournament_stat) for its two teams. Sportmonks
        # finalises season statistics within ~10 min of the whistle and we settle
        # after a 7 min grace window, so the PlayerSheet Statistics panel goes from
        # up to ~24 h stale (the daily ReferenceRefresher) to ~match-end fresh.
        # Fires once per fixture (the _settled false->true edge).
        if self._settled and not settled_before:
            await self._refresh_tournament_stats(fixture)

        log.info(
            "ingest.inplay.tick",
            fixture_internal_id=self.fixture_internal_id,
            fixture_updated=fixture_updated,
            events=events_count,
            comments=comments_count,
            lineups=lineups_count,
            player_stats=player_stats_count,
            price_ticks=len(price_notifs),
            settlements=len(settlement_notifs),
            lineup_drops=len(lineup_drop_notifs),
            team_stats=team_stats_count,
        )

    def _notif(self, kind: str, body: dict[str, Any]) -> tuple[str, bytes]:
        """Build a (subject, payload) tuple for ``commit_then_publish``."""
        return (
            f"fundxi.{kind}.{self.fixture_internal_id}",
            json.dumps({"kind": kind, **body}).encode(),
        )

    async def _project_fixture(self, *, session: AsyncSession, fixture_payload: dict[str, Any]) -> Fixture | None:
        """UPSERT the fixture itself (status, score, minute).

        Returns the projected ``Fixture`` (the caller reads its ``status`` to
        detect the full-time transition), or ``None`` if the payload was
        unprojectable (missing participants etc.) and was skipped."""
        group = self.id_maps.fixture_group_for(self.fixture_internal_id)
        if group is None:
            log.debug("ingest.inplay.fixture_skip", reason="no group in id_maps")
            return None
        try:
            fixture, smk_id = project_fixture(
                fixture_payload, group=group, team_id_by_sportmonks=self.id_maps.team_id_by_sportmonks
            )
        except (ValueError, TypeError, KeyError) as exc:
            log.debug("ingest.inplay.fixture_skip", reason=str(exc))
            return None
        await SqlAlchemyFixtureRepository(session).upsert_by_sportmonks_id(fixture, sportmonks_id=smk_id)
        return fixture

    async def _capture_prediction_if_upcoming(
        self, *, session: AsyncSession, fixture: Fixture | None, payload: dict[str, Any]
    ) -> None:
        """Upsert the fixture's frozen pre-match result probability, but ONLY while
        it is still upcoming — the last pre-kickoff write is the value the
        odds-based settlement uses. A no-op once the match is live/finished (so a
        live swing never rewrites the price the bet was struck at) and when the
        ``predictions`` include is absent."""
        if fixture is None or fixture.status is not FixtureStatus.UPCOMING:
            return
        probs = project_fixture_prediction(payload)
        if probs is None:
            return
        await SqlAlchemyFixturePredictionRepository(session).upsert(
            FixturePrediction(
                fixture_id=self.fixture_internal_id,
                p_home=probs[0],
                p_draw=probs[1],
                p_away=probs[2],
            ),
            source="sportmonks:237",
        )

    async def _settle_if_finished(
        self,
        *,
        session: AsyncSession,
        fixture: Fixture | None,
        scores_payload: Any,
        coefficients: PricingCoefficients,
    ) -> list[tuple[str, bytes]]:
        """At full-time, settle the fixture's result ONCE — but only after the
        ``settle_grace_seconds`` stabilization window (anchored on the first
        finished poll) has elapsed, so late events and final ratings have landed.
        No-op until FT, during the window, and after the one settlement."""
        if self._settled or fixture is None or fixture.status is not FixtureStatus.FINISHED:
            return []
        now = datetime.now(UTC)
        if self._finished_since is None:
            self._finished_since = now
        if (now - self._finished_since).total_seconds() < self.settle_grace_seconds:
            # Inside the post-FT stabilization window: keep ticking live (the
            # caller still prices), wait for late events / final ratings before
            # banking the result. Catches a 90'+ red card the first finished poll
            # would have missed.
            return []
        return await self._run_settlement(
            session=session, scores_payload=scores_payload, ts=now, coefficients=coefficients
        )

    async def _run_settlement(
        self,
        *,
        session: AsyncSession,
        scores_payload: Any,
        ts: datetime,
        coefficients: PricingCoefficients,
    ) -> list[tuple[str, bytes]]:
        """Bank the fixture's result ONCE: collective result event + suspensions +
        did-not-play penalties. Each underlying use case is idempotent (its own DB
        guard), so this is safe from both the grace path and the shutdown fallback.

        For a knockout decided on penalties (level CURRENT score), the winner is
        read from the PENALTY_SHOOTOUT block (``scores_payload``) and passed as
        ``winner_override`` so the eliminated side still takes its drop.
        Sets ``_settled`` so live pricing stops overwriting these ticks.

        The three events are STAGGERED by 1ms each. The price-tick PK is
        ``(player_id, ts)`` with ``on_conflict_do_nothing``, so a suspension /
        did-not-play tick written at the SAME ts as the player's settlement tick
        would collide and be silently dropped — a player on a settled team would
        never get his suspension. Distinct increasing timestamps make each event
        read the previous tick (last price = MAX ts) and apply MULTIPLICATIVELY
        on top of it (e.g. a benched winner: +result, then -did_not_play)."""
        pen_winner = penalty_shootout_winner(scores_payload)
        winner_override = Side(pen_winner) if pen_winner is not None else None
        notifications = await settle_fixture(
            session,
            fixture_id=self.fixture_internal_id,
            ts=ts,
            winner_override=winner_override,
            coefficients=coefficients,
        )
        notifications += await apply_suspensions(
            session,
            fixture_id=self.fixture_internal_id,
            ts=ts + timedelta(milliseconds=1),
            coefficients=coefficients,
        )
        notifications += await apply_did_not_play(
            session,
            fixture_id=self.fixture_internal_id,
            ts=ts + timedelta(milliseconds=2),
            coefficients=coefficients,
        )
        # Mark settled even when nothing was produced (knockout winner
        # undetermined, group draw, no cards, everyone featured): a retry next
        # poll would only re-log.
        self._settled = True
        return notifications

    async def _refresh_tournament_stats(self, fixture: Fixture | None) -> None:
        """Re-pull core.player_tournament_stat for THIS fixture's two teams right
        after it settles at full-time, scoped to those teams (two squad calls).

        Deliberately decoupled from the live tick path, exactly like
        ``_materialize_value_snapshots``:
        - runs in its OWN session, committed AFTER the settlement write, so a
          squad-endpoint hiccup can never roll back the result;
        - NEVER propagates an error to the ingest loop — the daily
          ``ReferenceRefresher`` is the catch-all net (and Sportmonks keeps
          refining the aggregate for days), so a transient failure here is
          harmless and self-heals on the next reference tick.

        ``bootstrap_player_stats`` only reads ``sportmonks_team_id`` from each
        pair, so the internal id we attach is informational."""
        if fixture is None or fixture.season_id is None:
            return
        sportmonks_by_internal = {internal: smk for smk, internal in self.id_maps.team_id_by_sportmonks.items()}
        teams: list[tuple[int, str]] = []
        for internal_team_id in (fixture.home_team_id, fixture.away_team_id):
            smk = sportmonks_by_internal.get(internal_team_id)
            if smk is not None:
                teams.append((smk, internal_team_id))
        if not teams:
            return
        try:
            async with self.session_factory() as session:
                count = await bootstrap_player_stats(
                    client=self.client,
                    raw_archive=SqlAlchemyRawSportmonksEventRepository(session),
                    player_repo=SqlAlchemyPlayerRepository(session),
                    stat_repo=SqlAlchemyPlayerTournamentStatRepository(session),
                    teams=teams,
                    season_id=fixture.season_id,
                )
                await session.commit()
            log.info(
                "ingest.inplay.tournament_stats_refreshed",
                fixture_internal_id=self.fixture_internal_id,
                teams=len(teams),
                upserts=count,
            )
        except Exception as exc:
            # Broad on purpose: a secondary projection must never break ingest;
            # logged (not silently swallowed) so the failure stays visible.
            log.warning(
                "ingest.inplay.tournament_stats_refresh_failed",
                fixture_internal_id=self.fixture_internal_id,
                error=str(exc),
            )

    async def _apply_lineup_drops_if_published(
        self, *, session: AsyncSession, fixture: Fixture | None, coefficients: PricingCoefficients
    ) -> list[tuple[str, bytes]]:
        """Once the starting XI is out, penalise dropped expected-starters (-2%).
        Recomputed each poll only until the decision is final — the first time it
        produces ticks, or as soon as the match is no longer upcoming (the XI is
        then locked)."""
        if self._lineup_processed:
            return []
        notifications = await apply_lineup_drops(
            session, fixture_id=self.fixture_internal_id, ts=datetime.now(UTC), coefficients=coefficients
        )
        if notifications or (fixture is not None and fixture.status is not FixtureStatus.UPCOMING):
            self._lineup_processed = True
        return notifications

    async def _project_events(self, *, session: AsyncSession, events_payload: list[dict[str, Any]]) -> int:
        """Full-set sync: the feed is the complete event set, so besides
        upserting we prune stored events Sportmonks no longer carries
        (replaced provisional events, VAR-rescinded ones)."""
        report = await sync_fixture_events(
            event_repo=SqlAlchemyMatchEventRepository(session),
            fixture_id=self.fixture_internal_id,
            events_payload=events_payload,
            player_id_by_sportmonks=self.id_maps.player_id_by_sportmonks,
            team_id_by_sportmonks=self.id_maps.team_id_by_sportmonks,
        )
        return report.upserted + report.deleted

    async def _project_comments(self, *, session: AsyncSession, comments_payload: list[dict[str, Any]]) -> int:
        repo = SqlAlchemyMatchCommentRepository(session)
        upserted = 0
        for payload in comments_payload:
            try:
                comment, smk_id = project_match_comment(payload, fixture_id=self.fixture_internal_id)
            except (ValueError, TypeError) as exc:
                log.debug("ingest.inplay.comment_skip", reason=str(exc))
                continue
            await repo.upsert_by_sportmonks_id(comment, sportmonks_id=smk_id)
            upserted += 1
        return upserted

    async def _project_lineups(self, *, session: AsyncSession, lineups_payload: list[dict[str, Any]]) -> int:
        repo = SqlAlchemyLineupRepository(session)
        upserted = 0
        for payload in lineups_payload:
            try:
                lineup, smk_id = project_lineup(
                    payload,
                    fixture_id=self.fixture_internal_id,
                    player_id_by_sportmonks=self.id_maps.player_id_by_sportmonks,
                    team_id_by_sportmonks=self.id_maps.team_id_by_sportmonks,
                )
            except (ValueError, TypeError) as exc:
                log.debug("ingest.inplay.lineup_skip", reason=str(exc))
                continue
            await repo.upsert_by_sportmonks_id(lineup, sportmonks_id=smk_id)
            upserted += 1
        return upserted

    async def _project_player_match_stats(
        self, *, session: AsyncSession, lineups_payload: list[dict[str, Any]]
    ) -> tuple[int, list[PlayerMatchStat], dict[int, PlayerMatchStat]]:
        """Project this poll's per-player stats. Also returns the just-
        projected ``curr`` rows and a snapshot of the PREVIOUS rows
        (taken before the upsert) so the pricing kernel can see only the
        increment since the last poll."""
        repo = SqlAlchemyPlayerMatchStatRepository(session)
        prev_by_player = {s.player_id: s for s in await repo.list_by_fixture(self.fixture_internal_id)}
        curr_stats: list[PlayerMatchStat] = []
        for payload in lineups_payload:
            result = project_player_match_stat(
                payload,
                fixture_id=self.fixture_internal_id,
                player_id_by_sportmonks=self.id_maps.player_id_by_sportmonks,
            )
            if result is None:
                continue
            stat, raw_details = result
            await repo.upsert(stat, raw_details=raw_details)
            curr_stats.append(stat)
        return len(curr_stats), curr_stats, prev_by_player

    async def _carried_in_price(self, session: AsyncSession, player_id: int) -> float | None:
        """The player's price as he WALKED INTO this match — the most
        recent tick from a prior fixture (or the pre-tournament
        baseline). Stable for the whole match, so the persistent
        'balance' the kernel adds the live move on top of never
        double-counts the current match."""
        row = await session.execute(
            text(
                """
                SELECT current_price FROM valuation.player_price_tick
                WHERE player_id = :p AND (fixture_id IS NULL OR fixture_id <> :fx)
                ORDER BY ts DESC LIMIT 1
                """
            ),
            {"p": player_id, "fx": self.fixture_internal_id},
        )
        price = row.scalar_one_or_none()
        return float(price) if price is not None else None

    async def _price_players(
        self,
        *,
        session: AsyncSession,
        curr_stats: list[PlayerMatchStat],
        prev_by_player: dict[int, PlayerMatchStat],
        coefficients: PricingCoefficients,
    ) -> list[tuple[str, bytes]]:
        """Run the canonical kernel for every player priced this poll. The
        kernel is the SAME pure function the spec defines and the replay
        uses — live and replay cannot diverge. Pressure modulation is left
        None for now (trends ingestion is a separate step); the kernel
        treats None as a no-op.

        A ``valuation.player_price_tick`` row + a per-player notification are
        produced ONLY when the price actually moved since the player's last
        tick. Quiet polls (every ~10-15s for ~2h) must not flood the tick
        table nor flash an unchanged price in the UI.

        Returns the ``fundxi.player_price_tick.<player_id>`` notifications for
        the players whose price moved."""
        if not curr_stats:
            return []
        ts = datetime.now(UTC)
        last_prices = await SqlAlchemyLatestPriceProvider(session).get_many([c.player_id for c in curr_stats])
        # Real pre-tournament starting price (Transfermarkt seed) per player; the
        # transitional provider falls back to the synthetic seed for the un-seeded tail.
        starting = await DbOrSyntheticStartingPriceProvider(session, as_of=ts).get_many(
            [c.player_id for c in curr_stats]
        )
        notifications: list[tuple[str, bytes]] = []
        for curr in curr_stats:
            base_value = starting.get(curr.player_id)
            if base_value is None:
                # No real base value (un-seeded, unpriceable) → emit no tick.
                continue
            carried = await self._carried_in_price(session, curr.player_id)
            snapshot = build_snapshot(
                curr,
                prev_by_player.get(curr.player_id),
                pressure_factor=None,
                is_live=True,
            )
            result = price_from_carried(base_value, carried, snapshot, coefficients)
            new_price = round(result.price, 2)
            last = last_prices.get(curr.player_id)
            if last is not None and round(last, 2) == new_price:
                # Unchanged since the last tick — no insert, no notification.
                continue
            await upsert_price_tick(
                session,
                player_id=curr.player_id,
                ts=ts,
                fixture_id=self.fixture_internal_id,
                current_price=new_price,
                performance_rating=round(curr.rating, 2) if curr.rating is not None else 6.0,
                source="engine",
            )
            notifications.append(
                (
                    f"{_PRICE_TICK_SUBJECT_PREFIX}{curr.player_id}",
                    json.dumps(
                        {
                            "kind": "player_price_tick",
                            "player_id": curr.player_id,
                            "fixture_id": self.fixture_internal_id,
                            "current_price": new_price,
                        }
                    ).encode(),
                )
            )
        return notifications

    async def _record_state(self, *, data: dict[str, Any], minute: int | None) -> None:
        """Log the current Sportmonks state to core.fixture_state_event when it
        changes, refreshing the fixture's state cache. Own session, AFTER the main
        commit; broad except so a capture hiccup never breaks the live tick. A
        repeat of the same state is a no-op, so re-observing each poll is cheap."""
        parsed = project_fixture_state(data)
        if parsed is None:
            return
        state_code, state_obj = parsed
        try:
            async with self.session_factory() as session:
                changed = await SqlAlchemyFixtureRepository(session).record_state_if_changed(
                    fixture_id=self.fixture_internal_id,
                    state_code=state_code,
                    state=state_obj,
                    minute=minute,
                    observed_at=datetime.now(UTC),
                )
                await session.commit()
            if changed:
                log.info(
                    "ingest.inplay.state_changed",
                    fixture_internal_id=self.fixture_internal_id,
                    state_code=state_code,
                    minute=minute,
                )
        except Exception as exc:
            # Broad on purpose: a secondary projection must never break ingest.
            log.warning(
                "ingest.inplay.state_record_failed",
                fixture_internal_id=self.fixture_internal_id,
                error=str(exc),
            )

    async def _materialize_value_snapshots(self, ticked_player_ids: set[int]) -> None:
        """Bucketed portfolio-value snapshot for holders of the ticked players.

        Deliberately decoupled from the live tick path:
        - runs in its OWN session, AFTER the ticks are committed, so it reads the
          just-persisted prices and cannot roll back the tick write;
        - NEVER propagates an error to the ingest loop — the value history is a
          secondary projection, and a snapshot failure must not drop live prices.
          The next poll re-materialises (idempotent per (portfolio, minute)).

        ``ts`` is WALL-CLOCK now(): a portfolio's value history lives on the
        user's real timeline, not the match clock."""
        if not ticked_player_ids:
            return
        from src.application.portfolio_snapshot_service import PortfolioSnapshotService

        try:
            async with self.session_factory() as session:
                await PortfolioSnapshotService.from_session(session).materialize_for_player_ticks(
                    ticked_player_ids=ticked_player_ids,
                    ts=datetime.now(UTC),
                )
                await session.commit()
        except Exception as exc:
            # Broad on purpose: a secondary projection must never break ingest;
            # logged (not silently swallowed) so the failure stays visible.
            log.warning(
                "ingest.inplay.value_snapshot_failed",
                fixture_internal_id=self.fixture_internal_id,
                players=len(ticked_player_ids),
                error=str(exc),
            )

    async def _project_team_match_stats(self, *, session: AsyncSession, stats_payload: list[dict[str, Any]]) -> int:
        if not stats_payload:
            return 0
        repo = SqlAlchemyTeamMatchStatRepository(session)
        rows: list[tuple[str, str, Any]] = []
        for projection in project_team_match_stats(stats_payload):
            internal_team_id = self.id_maps.team_id_by_sportmonks.get(projection.sportmonks_team_id)
            if internal_team_id is None:
                continue
            rows.append((internal_team_id, projection.type_code, projection.value))
        return await repo.upsert_batch(fixture_id=self.fixture_internal_id, rows=rows)


def _array(value: object) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]
