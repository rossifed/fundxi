"""WC tournament replay — Application Service.

DDD role: Application Service. Walks every fixture chronologically and
walks each fixture's events in order, applying the events-based pricing
strategy and emitting ONE price tick per impactful event (granular
Robinhood-style curve). Adds a starter clean-game bonus tick at FT.

Deterministic and idempotent: truncates the output tables before rebuilding.

Initial price for each player = the synthetic base_value (hash-deterministic
seed). Subsequent ticks evolve multiplicatively from real events.
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta

import structlog
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.match.lineup import LineupRole
from src.domain.match.match_event import MatchEvent, MatchEventType
from src.domain.valuation.player_valuation import ValuationSource
from src.infrastructure.db.models.fixture import FixtureORM
from src.infrastructure.db.models.lineup import LineupORM
from src.infrastructure.db.models.match_event import MatchEventORM
from src.infrastructure.db.models.player import PlayerORM
from src.infrastructure.db.models.player_daily_snapshot import PlayerDailySnapshotORM
from src.infrastructure.db.models.player_price_tick import PlayerPriceTickORM
from src.infrastructure.valuation.synthetic_valuation_provider import synthesize_valuation
from src.valuation.coefficients import DEFAULT_COEFFICIENTS
from src.valuation.strategies.events_based_v0 import compute_event_delta
from src.valuation.strategies.layered_v1 import (
    PlayingTimeKind,
    playing_time_delta,
    position_bucket,
    team_propagation_delta,
)

# Scoring events that ripple to the whole team (layer 4). Own goals are
# intentionally excluded until the provider's team_id semantics for OG
# are verified on real data — we don't guess.
_TEAM_SCORING_TYPES = {MatchEventType.GOAL, MatchEventType.PENALTY}

log = structlog.get_logger(__name__)

_NEGATIVE_TYPES = {
    MatchEventType.YELLOW_CARD,
    MatchEventType.RED_CARD,
    MatchEventType.YELLOW_RED_CARD,
    MatchEventType.PENALTY_MISSED,
    MatchEventType.OWN_GOAL,
}


@dataclass(frozen=True, slots=True)
class ReplayReport:
    fixtures: int
    ticks: int
    snapshots: int
    impacted_players: int


def _orm_event_to_domain(orm: MatchEventORM) -> MatchEvent:
    return MatchEvent(
        id=orm.id,
        fixture_id=orm.fixture_id,
        minute=orm.minute,
        extra_minute=orm.extra_minute,
        type=MatchEventType(orm.type),
        player_id=orm.player_id,
        related_player_id=orm.related_player_id,
        team_id=orm.team_id,
        info=orm.info,
        sequence=orm.sequence,
    )


async def replay_tournament(*, session: AsyncSession, tournament_start: datetime | None = None) -> ReplayReport:
    """Rebuild valuation.player_price_tick and player_daily_snapshot from
    scratch — one tick per impactful event."""
    # 0) Reset.
    await session.execute(delete(PlayerPriceTickORM))
    await session.execute(delete(PlayerDailySnapshotORM))

    # 1) Pre-load players (for base_value seeds).
    players = (await session.execute(select(PlayerORM.id))).all()
    base_seed_at = tournament_start or datetime(2026, 1, 1)
    base_value_by_player: dict[int, float] = {
        row.id: synthesize_valuation(row.id, as_of=base_seed_at).base_value for row in players
    }
    current_price_by_player: dict[int, float] = dict(base_value_by_player)

    # 2) Pre-load fixtures chronologically (+ team ids for team propagation).
    fixtures = (
        await session.execute(
            select(
                FixtureORM.id,
                FixtureORM.kickoff_at,
                FixtureORM.home_team_id,
                FixtureORM.away_team_id,
            )
            .where(FixtureORM.kickoff_at.is_not(None))
            .order_by(FixtureORM.kickoff_at)
        )
    ).all()
    if not fixtures:
        log.warning("wc_replay.no_fixtures")
        return ReplayReport(fixtures=0, ticks=0, snapshots=0, impacted_players=0)
    earliest = fixtures[0].kickoff_at
    if tournament_start is None:
        tournament_start = earliest - timedelta(days=1)

    # 3) Pre-load lineups grouped by fixture: starters + per-team rosters
    #    + position bucket (for team propagation and playing-time layers).
    lineups = (
        await session.execute(
            select(
                LineupORM.fixture_id,
                LineupORM.player_id,
                LineupORM.team_id,
                LineupORM.role,
                LineupORM.position,
            )
        )
    ).all()
    starters_by_fixture: dict[int, set[int]] = defaultdict(set)
    bench_by_fixture: dict[int, set[int]] = defaultdict(set)
    # fixture -> team_id -> [(player_id, position)]
    roster_by_fixture: dict[int, dict[str, list[tuple[int, str]]]] = defaultdict(lambda: defaultdict(list))
    for ln in lineups:
        roster_by_fixture[ln.fixture_id][ln.team_id].append((ln.player_id, ln.position))
        if ln.role == LineupRole.STARTER.value:
            starters_by_fixture[ln.fixture_id].add(ln.player_id)
        else:
            bench_by_fixture[ln.fixture_id].add(ln.player_id)

    # 4) Pre-load events grouped by fixture, sorted by in-match sequence.
    events_orm = (
        (await session.execute(select(MatchEventORM).order_by(MatchEventORM.fixture_id, MatchEventORM.sequence)))
        .scalars()
        .all()
    )
    events_by_fixture: dict[int, list[MatchEvent]] = defaultdict(list)
    for ev in events_orm:
        events_by_fixture[ev.fixture_id].append(_orm_event_to_domain(ev))

    # 5) Initial baseline tick for every player on the day before kickoff.
    tick_rows: list[dict[str, object]] = []
    for player_id, base in base_value_by_player.items():
        tick_rows.append(
            {
                "player_id": player_id,
                "ts": tournament_start,
                "fixture_id": None,
                "current_price": round(base, 2),
                "performance_rating": 6.5,
                "change_since_open": 0.0,
                "source": ValuationSource.ENGINE.value,
            }
        )

    # 6) Walk fixtures, then events within each fixture, emit a tick per
    #    impactful event.
    impacted: set[int] = set()

    def emit(player_id: int, ts: datetime, fx_id: int | None, delta_pct: float) -> None:
        """Apply a percent delta to a player and append the resulting tick.
        Shared by the team-propagation, playing-time and clean-game layers
        (Rule of Three — third delta emitter warrants the helper)."""
        prev = current_price_by_player.get(player_id, base_value_by_player.get(player_id, 50.0))
        new_price = round(prev * (1.0 + delta_pct / 100.0), 2)
        current_price_by_player[player_id] = new_price
        impacted.add(player_id)
        tick_rows.append(
            {
                "player_id": player_id,
                "ts": ts,
                "fixture_id": fx_id,
                "current_price": new_price,
                "performance_rating": round(6.5 + delta_pct / 4.0, 2),
                "change_since_open": round(delta_pct, 2),
                "source": ValuationSource.ENGINE.value,
            }
        )

    for fx in fixtures:
        fx_id = fx.id
        kickoff = fx.kickoff_at
        evs = events_by_fixture.get(fx_id, [])
        starters = starters_by_fixture.get(fx_id, set())
        rosters = roster_by_fixture.get(fx_id, {})
        subbed_on: set[int] = set()
        # Track which starters had any negative event during this fixture
        # so we can emit a clean-game bonus tick at FT.
        had_negative: set[int] = set()
        had_any: set[int] = set()

        for ev in evs:
            # Timestamp = kickoff + minute*60s + sequence (avoids PK collisions
            # for two events at the same minute for the same player).
            ts = kickoff + timedelta(minutes=ev.minute, seconds=ev.sequence)
            for affected_player in {ev.player_id, ev.related_player_id}:
                if affected_player is None:
                    continue
                delta_pct = compute_event_delta(ev, affected_player)
                if delta_pct == 0.0:
                    continue
                prev = current_price_by_player.get(affected_player, base_value_by_player.get(affected_player, 50.0))
                new_price = round(prev * (1.0 + delta_pct / 100.0), 2)
                current_price_by_player[affected_player] = new_price
                impacted.add(affected_player)
                had_any.add(affected_player)
                if ev.type in _NEGATIVE_TYPES and ev.player_id == affected_player:
                    had_negative.add(affected_player)
                tick_rows.append(
                    {
                        "player_id": affected_player,
                        "ts": ts,
                        "fixture_id": fx_id,
                        "current_price": new_price,
                        "performance_rating": round(6.5 + delta_pct / 4.0, 2),
                        "change_since_open": round(delta_pct, 2),
                        "source": ValuationSource.ENGINE.value,
                    }
                )

            # Layer 4 — team propagation: a team goal nudges every player
            # of the scoring team (+) and the conceding team (-). The
            # scorer/assist already moved individually this instant, so
            # exclude them to avoid double-count + PK collision.
            if ev.type in _TEAM_SCORING_TYPES and ev.team_id is not None and rosters:
                scoring_team = ev.team_id
                opponent_team = fx.away_team_id if scoring_team == fx.home_team_id else fx.home_team_id
                actors = {ev.player_id, ev.related_player_id}
                for pid, pos in rosters.get(scoring_team, []):
                    if pid in actors:
                        continue
                    emit(pid, ts, fx_id, team_propagation_delta(scored=True, bucket=position_bucket(pos)))
                for pid, pos in rosters.get(opponent_team, []):
                    if pid in actors:
                        continue
                    emit(pid, ts, fx_id, team_propagation_delta(scored=False, bucket=position_bucket(pos)))

            # Layer 5 — playing time on substitution: player_id comes on,
            # related_player_id goes off.
            if ev.type is MatchEventType.SUBSTITUTION:
                if ev.player_id is not None:
                    subbed_on.add(ev.player_id)
                    emit(ev.player_id, ts, fx_id, playing_time_delta(PlayingTimeKind.SUBBED_ON))
                if ev.related_player_id is not None:
                    emit(ev.related_player_id, ts, fx_id, playing_time_delta(PlayingTimeKind.SUBBED_OFF))

        # Layer 5 — unused subs: bench players who never came on take a
        # small one-off hit at FT (bounded, reversible: they recover by
        # starting/playing the next fixture — no permanent penalty term).
        ft_unused_ts = kickoff + timedelta(minutes=95, seconds=1)
        for bench_id in bench_by_fixture.get(fx_id, set()):
            if bench_id in subbed_on:
                continue
            emit(bench_id, ft_unused_ts, fx_id, playing_time_delta(PlayingTimeKind.UNUSED_SUB))

        # Clean-game bonus at FT: any starter with NO negative events. Even
        # players who had no events at all qualify (just showed up clean).
        ft_ts = kickoff + timedelta(minutes=95)
        for starter_id in starters:
            if starter_id in had_negative:
                continue
            bonus = DEFAULT_COEFFICIENTS.w_starter_clean_pct
            prev = current_price_by_player.get(starter_id, base_value_by_player.get(starter_id, 50.0))
            new_price = round(prev * (1.0 + bonus / 100.0), 2)
            current_price_by_player[starter_id] = new_price
            impacted.add(starter_id)
            tick_rows.append(
                {
                    "player_id": starter_id,
                    "ts": ft_ts,
                    "fixture_id": fx_id,
                    "current_price": new_price,
                    "performance_rating": round(6.5 + bonus / 4.0, 2),
                    "change_since_open": round(bonus, 2),
                    "source": ValuationSource.ENGINE.value,
                }
            )

    # 7) Deduplicate ticks on (player_id, ts) — two same-minute same-sequence
    #    events for the same player would otherwise collide on the PK. Keep
    #    the last write (it's the most up-to-date price for that instant).
    tick_dedup: dict[tuple[int, datetime], dict[str, object]] = {}
    for row in tick_rows:
        pid = row["player_id"]
        ts = row["ts"]
        assert isinstance(pid, int) and isinstance(ts, datetime)
        tick_dedup[(pid, ts)] = row
    deduped_ticks = list(tick_dedup.values())

    # 8) Bulk insert ticks.
    inserted_ticks = 0
    chunk = 5000
    for i in range(0, len(deduped_ticks), chunk):
        batch = deduped_ticks[i : i + chunk]
        if not batch:
            continue
        await session.execute(pg_insert(PlayerPriceTickORM).values(batch))
        inserted_ticks += len(batch)

    # 8) Daily snapshots — DERIVED from the (deduped) tick curve, not a
    #    second independent replay. This guarantees the snapshot open/
    #    close always agrees with the sparkline, whatever layers produced
    #    the ticks (events + team propagation + playing-time + future
    #    stat/xG). open = carried close of the prior day; close = last
    #    tick on that day. Snapshots only for days that had fixtures.
    fixture_dates: set[date] = {fx.kickoff_at.date() for fx in fixtures}

    ticks_by_player: dict[int, list[tuple[datetime, float]]] = defaultdict(list)
    for row in deduped_ticks:
        pid = row["player_id"]
        ts = row["ts"]
        price = row["current_price"]
        assert isinstance(pid, int) and isinstance(ts, datetime) and isinstance(price, float)
        ticks_by_player[pid].append((ts, price))

    daily_rows: list[dict[str, object]] = []
    for player_id, seq in ticks_by_player.items():
        seq.sort(key=lambda tp: tp[0])
        carried = base_value_by_player.get(player_id, seq[0][1])
        by_day: dict[date, list[float]] = defaultdict(list)
        for ts, price in seq:
            by_day[ts.date()].append(price)
        for day in sorted(by_day.keys()):
            opened = carried
            close = by_day[day][-1]
            carried = close
            if day not in fixture_dates:
                continue  # baseline-only day (e.g. tournament_start)
            change_24h = round((close - opened) / opened * 100.0, 2) if opened > 0 else 0.0
            daily_rows.append(
                {
                    "player_id": player_id,
                    "date": day,
                    "open_price": round(opened, 2),
                    "close_price": round(close, 2),
                    "change_24h": change_24h,
                }
            )

    inserted_snapshots = 0
    for i in range(0, len(daily_rows), chunk):
        batch = daily_rows[i : i + chunk]
        if not batch:
            continue
        await session.execute(pg_insert(PlayerDailySnapshotORM).values(batch))
        inserted_snapshots += len(batch)

    log.info(
        "wc_replay.done",
        fixtures=len(fixtures),
        ticks=inserted_ticks,
        snapshots=inserted_snapshots,
        impacted_players=len(impacted),
    )
    return ReplayReport(
        fixtures=len(fixtures),
        ticks=inserted_ticks,
        snapshots=inserted_snapshots,
        impacted_players=len(impacted),
    )
