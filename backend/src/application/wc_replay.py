"""WC tournament replay — Application Service.

DDD role: Application Service. Walks every fixture chronologically and
walks each fixture's events in order, applying the events-based pricing
strategy and emitting ONE price tick per impactful event (granular
Robinhood-style curve). Adds a starter clean-game bonus tick at FT.

Deterministic and idempotent: truncates the output tables before rebuilding.

Initial price for each player = the synthetic base_value (hash-deterministic
seed). Subsequent ticks evolve multiplicatively from real events.

``replay_tournament`` is a thin orchestrator over single-purpose phases:
preload → build ticks → dedup → derive daily snapshots → bulk insert. Each
phase is a small, separately-readable function; the row shapes are frozen
dataclasses (``TickRow`` / ``DailyRow``) so there is no untyped dict plumbing.
"""

from collections import defaultdict
from collections.abc import Callable
from dataclasses import asdict, dataclass
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
from src.infrastructure.db.price_tick_writer import price_tick_row
from src.infrastructure.valuation.synthetic_valuation_provider import synthesize_valuation
from src.valuation.coefficients import DEFAULT_COEFFICIENTS
from src.valuation.strategies.layered_v1 import (
    PlayingTimeKind,
    TeamRosters,
    per_event_deltas,
    playing_time_delta,
)

log = structlog.get_logger(__name__)

_NEGATIVE_TYPES = {
    MatchEventType.YELLOW_CARD,
    MatchEventType.RED_CARD,
    MatchEventType.YELLOW_RED_CARD,
    MatchEventType.PENALTY_MISSED,
    MatchEventType.OWN_GOAL,
}

_ENGINE = ValuationSource.ENGINE.value
_BASELINE_RATING = 6.5
_INSERT_CHUNK = 5000


@dataclass(frozen=True, slots=True)
class ReplayReport:
    fixtures: int
    ticks: int
    snapshots: int
    impacted_players: int


@dataclass(frozen=True, slots=True)
class TickRow:
    player_id: int
    ts: datetime
    fixture_id: int | None
    current_price: float
    performance_rating: float
    change_since_open: float
    source: str


@dataclass(frozen=True, slots=True)
class DailyRow:
    player_id: int
    date: date
    open_price: float
    close_price: float
    change_24h: float


@dataclass(frozen=True, slots=True)
class FixtureRow:
    """One fixture with a guaranteed (non-null) kickoff."""

    id: int
    kickoff_at: datetime
    home_team_id: str
    away_team_id: str


@dataclass(frozen=True, slots=True)
class FixtureLineups:
    """Per-fixture lineup view: starters, bench, and team rosters."""

    starters: dict[int, set[int]]
    bench: dict[int, set[int]]
    roster: dict[int, dict[str, list[tuple[int, str]]]]  # fixture -> team -> [(player, position)]


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


# ----- Phase: preload -------------------------------------------------------


async def _preload_base_values(session: AsyncSession, *, seed_at: datetime) -> dict[int, float]:
    """Synthetic base_value seed for every player (hash-deterministic)."""
    players = (await session.execute(select(PlayerORM.id))).all()
    return {row.id: synthesize_valuation(row.id, as_of=seed_at).base_value for row in players}


async def _preload_fixtures(session: AsyncSession) -> list[FixtureRow]:
    """Fixtures with a kickoff, chronological (+ team ids for propagation)."""
    rows = (
        await session.execute(
            select(FixtureORM.id, FixtureORM.kickoff_at, FixtureORM.home_team_id, FixtureORM.away_team_id)
            .where(FixtureORM.kickoff_at.is_not(None))
            .order_by(FixtureORM.kickoff_at)
        )
    ).all()
    return [
        FixtureRow(id=r.id, kickoff_at=r.kickoff_at, home_team_id=r.home_team_id, away_team_id=r.away_team_id)
        for r in rows
        if r.kickoff_at is not None
    ]


async def _preload_lineups(session: AsyncSession) -> FixtureLineups:
    """Group lineups by fixture into starters / bench / per-team rosters."""
    rows = (
        await session.execute(
            select(LineupORM.fixture_id, LineupORM.player_id, LineupORM.team_id, LineupORM.role, LineupORM.position)
        )
    ).all()
    starters: dict[int, set[int]] = defaultdict(set)
    bench: dict[int, set[int]] = defaultdict(set)
    roster: dict[int, dict[str, list[tuple[int, str]]]] = defaultdict(lambda: defaultdict(list))
    for ln in rows:
        roster[ln.fixture_id][ln.team_id].append((ln.player_id, ln.position))
        if ln.role == LineupRole.STARTER.value:
            starters[ln.fixture_id].add(ln.player_id)
        else:
            bench[ln.fixture_id].add(ln.player_id)
    return FixtureLineups(starters=starters, bench=bench, roster=roster)


async def _preload_events(session: AsyncSession) -> dict[int, list[MatchEvent]]:
    """Events grouped by fixture, in in-match sequence order."""
    events_orm = (
        (await session.execute(select(MatchEventORM).order_by(MatchEventORM.fixture_id, MatchEventORM.sequence)))
        .scalars()
        .all()
    )
    by_fixture: dict[int, list[MatchEvent]] = defaultdict(list)
    for ev in events_orm:
        by_fixture[ev.fixture_id].append(_orm_event_to_domain(ev))
    return by_fixture


# ----- Phase: build ticks ---------------------------------------------------


def _build_tick_rows(
    *,
    fixtures: list[FixtureRow],
    events_by_fixture: dict[int, list[MatchEvent]],
    lineups: FixtureLineups,
    base_value_by_player: dict[int, float],
    tournament_start: datetime,
) -> tuple[list[TickRow], set[int]]:
    """Produce the full tick list from preloaded data — no I/O.

    Returns the ticks (baseline + one per impactful event + FT bonuses) and the
    set of impacted player ids. Pure given its inputs; the running price book is
    a local accumulator.
    """
    current_price_by_player: dict[int, float] = dict(base_value_by_player)
    impacted: set[int] = set()
    tick_rows: list[TickRow] = []

    def emit(player_id: int, ts: datetime, fx_id: int | None, delta_pct: float) -> None:
        """Apply a percent delta to a player and append the resulting tick.
        Shared by the event, team-propagation, playing-time and clean-game
        layers so every price move is recorded the same way."""
        prev = current_price_by_player.get(player_id, base_value_by_player.get(player_id, 50.0))
        new_price = round(prev * (1.0 + delta_pct / 100.0), 2)
        current_price_by_player[player_id] = new_price
        impacted.add(player_id)
        tick_rows.append(
            TickRow(
                player_id=player_id,
                ts=ts,
                fixture_id=fx_id,
                current_price=new_price,
                performance_rating=round(_BASELINE_RATING + delta_pct / 4.0, 2),
                change_since_open=round(delta_pct, 2),
                source=_ENGINE,
            )
        )

    # Baseline tick for every player on the day before kickoff.
    for player_id, base in base_value_by_player.items():
        tick_rows.append(
            TickRow(
                player_id=player_id,
                ts=tournament_start,
                fixture_id=None,
                current_price=round(base, 2),
                performance_rating=_BASELINE_RATING,
                change_since_open=0.0,
                source=_ENGINE,
            )
        )

    for fx in fixtures:
        _replay_fixture(fx, events_by_fixture.get(fx.id, []), lineups, emit)

    return tick_rows, impacted


def _replay_fixture(
    fx: FixtureRow,
    events: list[MatchEvent],
    lineups: FixtureLineups,
    emit: Callable[[int, datetime, int | None, float], None],
) -> None:
    """Emit every tick produced by one fixture: per-event deltas, the unused-sub
    penalty, and the starter clean-game bonus at FT."""
    fx_id = fx.id
    kickoff = fx.kickoff_at
    starters = lineups.starters.get(fx_id, set())
    subbed_on: set[int] = set()
    had_negative: set[int] = set()  # starters with any negative event → no clean-game bonus
    rosters_obj = TeamRosters(
        by_team=lineups.roster.get(fx_id, {}),
        home_team_id=fx.home_team_id,
        away_team_id=fx.away_team_id,
    )

    for ev in events:
        # Timestamp = kickoff + minute*60s + sequence (avoids PK collisions for
        # two events at the same minute for the same player).
        ts = kickoff + timedelta(minutes=ev.minute, seconds=ev.sequence)
        if ev.type in _NEGATIVE_TYPES and ev.player_id is not None:
            had_negative.add(ev.player_id)
        if ev.type is MatchEventType.SUBSTITUTION and ev.player_id is not None:
            subbed_on.add(ev.player_id)
        # The shared kernel produces every (player, delta) for this event:
        # L1 event + L5 sub + L4 team propagation. The same call powers the
        # simulator sink, so the curves cannot diverge.
        for pid, delta_pct in per_event_deltas(ev, rosters=rosters_obj):
            emit(pid, ts, fx_id, delta_pct)

    # Layer 5 — unused subs: bench players who never came on take a small one-off
    # hit at FT (bounded, reversible: they recover by playing the next fixture).
    ft_unused_ts = kickoff + timedelta(minutes=95, seconds=1)
    for bench_id in lineups.bench.get(fx_id, set()):
        if bench_id in subbed_on:
            continue
        emit(bench_id, ft_unused_ts, fx_id, playing_time_delta(PlayingTimeKind.UNUSED_SUB))

    # Clean-game bonus at FT: any starter with NO negative events. Even players
    # who had no events at all qualify (just showed up clean).
    ft_ts = kickoff + timedelta(minutes=95)
    for starter_id in starters:
        if starter_id in had_negative:
            continue
        emit(starter_id, ft_ts, fx_id, DEFAULT_COEFFICIENTS.w_starter_clean_pct)


# ----- Phase: dedup + derive snapshots --------------------------------------


def _dedup_ticks(tick_rows: list[TickRow]) -> list[TickRow]:
    """Collapse ticks colliding on the (player_id, ts) PK — last write wins
    (the most up-to-date price for that instant)."""
    dedup: dict[tuple[int, datetime], TickRow] = {}
    for row in tick_rows:
        dedup[(row.player_id, row.ts)] = row
    return list(dedup.values())


def _derive_daily_snapshots(
    deduped_ticks: list[TickRow],
    *,
    base_value_by_player: dict[int, float],
    fixture_dates: set[date],
) -> list[DailyRow]:
    """Daily open/close snapshots DERIVED from the tick curve (not a second
    replay), so the snapshot always agrees with the sparkline. open = carried
    close of the prior day; close = last tick that day. Days without fixtures
    (e.g. the baseline-only day) carry forward but emit no snapshot.
    """
    ticks_by_player: dict[int, list[tuple[datetime, float]]] = defaultdict(list)
    for row in deduped_ticks:
        ticks_by_player[row.player_id].append((row.ts, row.current_price))

    daily_rows: list[DailyRow] = []
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
                DailyRow(
                    player_id=player_id,
                    date=day,
                    open_price=round(opened, 2),
                    close_price=round(close, 2),
                    change_24h=change_24h,
                )
            )
    return daily_rows


# ----- Phase: persist -------------------------------------------------------


async def _bulk_insert(session: AsyncSession, orm: type, rows: list[dict[str, object]]) -> int:
    """Chunked bulk insert. Caller guarantees no PK collisions (ticks are
    deduped, snapshots are one-per-(player, day))."""
    inserted = 0
    for i in range(0, len(rows), _INSERT_CHUNK):
        batch = rows[i : i + _INSERT_CHUNK]
        if not batch:
            continue
        await session.execute(pg_insert(orm).values(batch))
        inserted += len(batch)
    return inserted


# ----- Orchestrator ---------------------------------------------------------


async def replay_tournament(*, session: AsyncSession, tournament_start: datetime | None = None) -> ReplayReport:
    """Rebuild valuation.player_price_tick and player_daily_snapshot from
    scratch — one tick per impactful event."""
    await session.execute(delete(PlayerPriceTickORM))
    await session.execute(delete(PlayerDailySnapshotORM))

    # base_value seed uses the caller's tournament_start (or a fixed default),
    # independent of the fixture-derived start used for the baseline tick ts.
    base_value_by_player = await _preload_base_values(session, seed_at=tournament_start or datetime(2026, 1, 1))

    fixtures = await _preload_fixtures(session)
    if not fixtures:
        log.warning("wc_replay.no_fixtures")
        return ReplayReport(fixtures=0, ticks=0, snapshots=0, impacted_players=0)
    if tournament_start is None:
        tournament_start = fixtures[0].kickoff_at - timedelta(days=1)

    lineups = await _preload_lineups(session)
    events_by_fixture = await _preload_events(session)

    tick_rows, impacted = _build_tick_rows(
        fixtures=fixtures,
        events_by_fixture=events_by_fixture,
        lineups=lineups,
        base_value_by_player=base_value_by_player,
        tournament_start=tournament_start,
    )
    deduped_ticks = _dedup_ticks(tick_rows)

    fixture_dates: set[date] = {fx.kickoff_at.date() for fx in fixtures}
    daily_rows = _derive_daily_snapshots(
        deduped_ticks, base_value_by_player=base_value_by_player, fixture_dates=fixture_dates
    )

    # Tick column set comes from price_tick_row (the single source shared with
    # the live/sim writers); TickRow stays the in-memory compute structure.
    tick_payload = [
        price_tick_row(
            player_id=r.player_id,
            ts=r.ts,
            fixture_id=r.fixture_id,
            current_price=r.current_price,
            performance_rating=r.performance_rating,
            change_since_open=r.change_since_open,
            source=r.source,
        )
        for r in deduped_ticks
    ]
    inserted_ticks = await _bulk_insert(session, PlayerPriceTickORM, tick_payload)
    inserted_snapshots = await _bulk_insert(session, PlayerDailySnapshotORM, [asdict(r) for r in daily_rows])

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
