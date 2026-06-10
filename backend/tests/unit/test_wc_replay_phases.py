"""Unit tests for the pure phases of wc_replay.

The replay used to be one ~250-line DB-bound function; decomposing it exposed
the price-curve logic as pure functions (no session), so the parts that matter
most — baseline + event ticks, the clean-game bonus, dedup, and the
tick-derived daily snapshots — are now unit-testable without a database.
"""

from datetime import datetime, timedelta

from src.application.wc_replay import (
    DailyRow,
    FixtureLineups,
    FixtureRow,
    TickRow,
    _build_tick_rows,
    _dedup_ticks,
    _derive_daily_snapshots,
)
from src.domain.match.match_event import MatchEvent, MatchEventType
from src.valuation.coefficients import DEFAULT_COEFFICIENTS

_TOURNAMENT_START = datetime(2026, 6, 10, 11, 0)
_KICKOFF = datetime(2026, 6, 11, 18, 0)
_FT_TS = _KICKOFF + timedelta(minutes=95)  # clean-game bonus timestamp


def _event(event_id: int, etype: MatchEventType, player_id: int, team_id: str, minute: int, seq: int) -> MatchEvent:
    return MatchEvent(
        id=event_id,
        fixture_id=100,
        minute=minute,
        extra_minute=None,
        type=etype,
        player_id=player_id,
        related_player_id=None,
        team_id=team_id,
        info=None,
        sequence=seq,
    )


def _setup() -> tuple[list[FixtureRow], dict[int, list[MatchEvent]], FixtureLineups, dict[int, float]]:
    fixtures = [FixtureRow(id=100, kickoff_at=_KICKOFF, home_team_id="A", away_team_id="B")]
    events = {
        100: [
            _event(1, MatchEventType.GOAL, player_id=1, team_id="A", minute=30, seq=1),
            _event(2, MatchEventType.RED_CARD, player_id=4, team_id="B", minute=40, seq=2),
        ]
    }
    lineups = FixtureLineups(
        starters={100: {1, 2, 3, 4, 5, 6}},
        bench={100: set()},
        roster={100: {"A": [(1, "FW"), (2, "MF"), (3, "DF")], "B": [(4, "FW"), (5, "MF"), (6, "DF")]}},
    )
    base = {pid: 50.0 for pid in range(1, 7)}
    return fixtures, events, lineups, base


def test_build_tick_rows_emits_a_flat_baseline_for_every_player() -> None:
    fixtures, events, lineups, base = _setup()
    ticks, _impacted = _build_tick_rows(
        fixtures=fixtures,
        events_by_fixture=events,
        lineups=lineups,
        base_value_by_player=base,
        tournament_start=_TOURNAMENT_START,
    )
    baseline = [t for t in ticks if t.fixture_id is None]
    assert {t.player_id for t in baseline} == set(range(1, 7))
    assert all(t.ts == _TOURNAMENT_START for t in baseline)
    assert all(t.change_since_open == 0.0 for t in baseline)
    assert all(t.current_price == 50.0 for t in baseline)


def test_build_tick_rows_moves_the_scorer_and_marks_them_impacted() -> None:
    fixtures, events, lineups, base = _setup()
    ticks, impacted = _build_tick_rows(
        fixtures=fixtures,
        events_by_fixture=events,
        lineups=lineups,
        base_value_by_player=base,
        tournament_start=_TOURNAMENT_START,
    )
    assert 1 in impacted
    scorer_event_ticks = [t for t in ticks if t.player_id == 1 and t.fixture_id == 100 and t.ts != _FT_TS]
    assert scorer_event_ticks, "the goal must produce at least one tick for the scorer"
    assert any(t.change_since_open > 0 for t in scorer_event_ticks)


def test_build_tick_rows_grants_clean_game_bonus_to_clean_starters_only() -> None:
    fixtures, events, lineups, base = _setup()
    ticks, _impacted = _build_tick_rows(
        fixtures=fixtures,
        events_by_fixture=events,
        lineups=lineups,
        base_value_by_player=base,
        tournament_start=_TOURNAMENT_START,
    )
    clean = {t.player_id for t in ticks if t.ts == _FT_TS}
    # Player 4 took a red card → excluded. Everyone else started clean.
    assert clean == {1, 2, 3, 5, 6}
    bonus = round(DEFAULT_COEFFICIENTS.w_starter_clean_pct, 2)
    assert all(t.change_since_open == bonus for t in ticks if t.ts == _FT_TS)


def test_dedup_ticks_keeps_the_last_write_per_player_ts() -> None:
    ts = datetime(2026, 6, 11, 19, 0)
    rows = [
        TickRow(1, ts, None, 50.0, 6.5, 0.0, "engine"),
        TickRow(1, ts, 100, 55.0, 7.0, 5.0, "engine"),  # same (player, ts) → wins
        TickRow(2, ts, 100, 40.0, 6.0, -2.0, "engine"),
    ]
    out = _dedup_ticks(rows)
    by_player = {r.player_id: r for r in out}
    assert len(out) == 2
    assert by_player[1].current_price == 55.0


def test_derive_daily_snapshots_opens_at_carried_close_and_skips_non_fixture_days() -> None:
    baseline_day = _TOURNAMENT_START
    d1_a = datetime(2026, 6, 11, 18, 30)
    d1_b = datetime(2026, 6, 11, 19, 30)
    ticks = [
        TickRow(1, baseline_day, None, 50.0, 6.5, 0.0, "engine"),  # day before, no fixture
        TickRow(1, d1_a, 100, 55.0, 7.0, 10.0, "engine"),
        TickRow(1, d1_b, 100, 53.0, 7.0, -3.0, "engine"),  # last tick of the day → close
    ]
    rows = _derive_daily_snapshots(
        ticks, base_value_by_player={1: 50.0}, fixture_dates={_KICKOFF.date()}
    )
    assert rows == [
        DailyRow(player_id=1, date=_KICKOFF.date(), open_price=50.0, close_price=53.0, change_24h=6.0),
    ]
