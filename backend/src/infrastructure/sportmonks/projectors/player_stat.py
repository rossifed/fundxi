"""project_player_stat — Sportmonks player.statistics block → PlayerTournamentStat.

DDD role: Domain Service (pure function). Maps a single statistics block
(one entry from `data.statistics[]` of a /players response) to our
domain Value Object.

Sportmonks v3 stat type IDs we surface as primary columns. Names verified
against the provider catalog (fixtures/{id}?include=lineups.details.type):
- 42   SHOTS_TOTAL
- 41   SHOTS_OFF_TARGET
- 51   OFFSIDES
- 52   GOALS         (value: {total, goals, penalties})
- 56   FOULS         (committed)
- 57   SAVES         (goalkeeping)
- 58   SHOTS_BLOCKED  (blocks made by the player)
- 78   TACKLES
- 79   ASSISTS
- 80   PASSES_TOTAL
- 83   REDCARDS      (straight reds only)
- 84   YELLOWCARDS   (first yellows only — a second yellow is NOT counted here)
- 85   YELLOWRED_CARDS (second yellow → sending-off; counts as a red for us)
- 86   SHOTS_ON_TARGET
- 88   GOALS_CONCEDED (goalkeeping)
- 94   DISPOSSESSED
- 96   FOULS_DRAWN
- 98   TOTAL_CROSSES
- 99   ACCURATE_CROSSES
- 100  INTERCEPTIONS
- 101  CLEARANCES
- 105  TOTAL_DUELS
- 106  DUELS_WON
- 107  AERIALS_WON
- 108  DRIBBLE_ATTEMPTS
- 109  SUCCESSFUL_DRIBBLES
- 110  DRIBBLED_PAST
- 116  ACCURATE_PASSES
- 117  KEY_PASSES
- 118  RATING        (value: {average, highest, lowest})
- 119  MINUTES_PLAYED
- 122  LONG_BALLS
- 124  THROUGH_BALLS
- 194  CLEANSHEET
- 321  APPEARANCES
- 324  OWN_GOALS
- 571  ERROR_LEAD_TO_GOAL
- 580  BIG_CHANCES_CREATED
- 581  BIG_CHANCES_MISSED
- 1584 PASSES_ACCURACY (Accurate Passes Percentage; value: {total: 85.34})

Anything else we receive lands in `raw_stats` as-is so we can surface
new metrics later without re-ingesting.
"""

from typing import Any

from src.domain.player.player_tournament_stat import PlayerTournamentStat

_STAT_GOALS = 52
_STAT_ASSISTS = 79
_STAT_RED_CARDS = 83
_STAT_YELLOW_CARDS = 84
_STAT_YELLOW_RED_CARDS = 85
_STAT_SHOTS_TOTAL = 42
_STAT_SHOTS_ON_TARGET = 86
_STAT_KEY_PASSES = 117
_STAT_PASSES_TOTAL = 80
_STAT_PASSES_ACCURACY = 1584
_STAT_RATING = 118
_STAT_MINUTES_PLAYED = 119
_STAT_APPEARANCES = 321
# Enriched set
_STAT_SHOTS_OFF_TARGET = 41
_STAT_OFFSIDES = 51
_STAT_BIG_CHANCES_CREATED = 580
_STAT_ACCURATE_PASSES = 116
_STAT_CROSSES_TOTAL = 98
_STAT_CROSSES_ACCURATE = 99
_STAT_LONG_BALLS = 122
_STAT_THROUGH_BALLS = 124
_STAT_DRIBBLE_ATTEMPTS = 108
_STAT_DRIBBLES_COMPLETED = 109
_STAT_DISPOSSESSED = 94
_STAT_DRIBBLED_PAST = 110
_STAT_FOULS_DRAWN = 96
_STAT_TACKLES = 78
_STAT_INTERCEPTIONS = 100
_STAT_CLEARANCES = 101
_STAT_TOTAL_DUELS = 105
_STAT_DUELS_WON = 106
_STAT_AERIALS_WON = 107
_STAT_SHOTS_BLOCKED = 58
_STAT_FOULS = 56
_STAT_SAVES = 57
_STAT_GOALS_CONCEDED = 88
_STAT_BIG_CHANCES_MISSED = 581
_STAT_OWN_GOALS = 324
_STAT_ERRORS_LEADING_TO_GOAL = 571
_STAT_CLEAN_SHEETS = 194


def _total(value: object) -> int | None:
    """Sportmonks value can be a scalar (rare) or an object with `total`."""
    if isinstance(value, dict):
        v = value.get("total")
        if isinstance(v, int):
            return v
        if isinstance(v, float):
            return int(v)
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    return None


def _total_float(value: object) -> float | None:
    """Like ``_total`` but keeps the fractional part — used for the
    pass-accuracy percentage whose ``total`` is a float (e.g. 85.34)."""
    if isinstance(value, dict):
        v = value.get("total")
        if isinstance(v, (int, float)):
            return float(v)
        if isinstance(v, str):
            try:
                return float(v)
            except ValueError:
                return None
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _average(value: object) -> float | None:
    if isinstance(value, dict):
        v = value.get("average")
        if isinstance(v, (int, float)):
            return float(v)
        if isinstance(v, str):
            try:
                return float(v)
            except ValueError:
                return None
    return None


def project_player_stat(
    block: dict[str, Any],
    *,
    internal_player_id: int,
) -> tuple[PlayerTournamentStat, int, dict[str, Any]]:
    """Return (stat, sportmonks_statistic_id, raw_details_payload).

    The raw_details_payload is the full Sportmonks `details` array — caller
    persists it as JSONB. Caller passes the internal player_id (we don't
    resolve it here; that's the worker's job).
    """
    sportmonks_statistic_id = block["id"]
    if not isinstance(sportmonks_statistic_id, int):
        raise TypeError(f"statistic.id must be int, got {type(sportmonks_statistic_id).__name__}")
    season_id = block.get("season_id")
    if not isinstance(season_id, int):
        raise ValueError(f"statistic block missing season_id: {block!r}")

    by_type: dict[int, Any] = {}
    for det in block.get("details", []):
        if not isinstance(det, dict):
            continue
        t = det.get("type_id")
        if isinstance(t, int):
            by_type[t] = det.get("value")

    stat = PlayerTournamentStat(
        player_id=internal_player_id,
        season_id=season_id,
        appearances=_total(by_type.get(_STAT_APPEARANCES)),
        minutes_played=_total(by_type.get(_STAT_MINUTES_PLAYED)),
        goals=_total(by_type.get(_STAT_GOALS)),
        assists=_total(by_type.get(_STAT_ASSISTS)),
        yellow_cards=_total(by_type.get(_STAT_YELLOW_CARDS)) or 0,
        # A second-yellow sending-off lives under type 85, not 83 — it is a red.
        red_cards=(_total(by_type.get(_STAT_RED_CARDS)) or 0) + (_total(by_type.get(_STAT_YELLOW_RED_CARDS)) or 0),
        shots_total=_total(by_type.get(_STAT_SHOTS_TOTAL)),
        shots_on_target=_total(by_type.get(_STAT_SHOTS_ON_TARGET)),
        key_passes=_total(by_type.get(_STAT_KEY_PASSES)),
        passes_total=_total(by_type.get(_STAT_PASSES_TOTAL)),
        passes_accuracy=_total_float(by_type.get(_STAT_PASSES_ACCURACY)),
        rating_avg=_average(by_type.get(_STAT_RATING)),
        shots_off_target=_total(by_type.get(_STAT_SHOTS_OFF_TARGET)),
        offsides=_total(by_type.get(_STAT_OFFSIDES)),
        big_chances_created=_total(by_type.get(_STAT_BIG_CHANCES_CREATED)),
        accurate_passes=_total(by_type.get(_STAT_ACCURATE_PASSES)),
        crosses_total=_total(by_type.get(_STAT_CROSSES_TOTAL)),
        crosses_accurate=_total(by_type.get(_STAT_CROSSES_ACCURATE)),
        long_balls=_total(by_type.get(_STAT_LONG_BALLS)),
        through_balls=_total(by_type.get(_STAT_THROUGH_BALLS)),
        dribble_attempts=_total(by_type.get(_STAT_DRIBBLE_ATTEMPTS)),
        dribbles_completed=_total(by_type.get(_STAT_DRIBBLES_COMPLETED)),
        dispossessed=_total(by_type.get(_STAT_DISPOSSESSED)),
        dribbled_past=_total(by_type.get(_STAT_DRIBBLED_PAST)),
        fouls_drawn=_total(by_type.get(_STAT_FOULS_DRAWN)),
        tackles=_total(by_type.get(_STAT_TACKLES)),
        interceptions=_total(by_type.get(_STAT_INTERCEPTIONS)),
        clearances=_total(by_type.get(_STAT_CLEARANCES)),
        total_duels=_total(by_type.get(_STAT_TOTAL_DUELS)),
        duels_won=_total(by_type.get(_STAT_DUELS_WON)),
        aerials_won=_total(by_type.get(_STAT_AERIALS_WON)),
        shots_blocked=_total(by_type.get(_STAT_SHOTS_BLOCKED)),
        errors_leading_to_goal=_total(by_type.get(_STAT_ERRORS_LEADING_TO_GOAL)),
        fouls=_total(by_type.get(_STAT_FOULS)),
        own_goals=_total(by_type.get(_STAT_OWN_GOALS)),
        saves=_total(by_type.get(_STAT_SAVES)),
        goals_conceded=_total(by_type.get(_STAT_GOALS_CONCEDED)),
        big_chances_missed=_total(by_type.get(_STAT_BIG_CHANCES_MISSED)),
        clean_sheets=_total(by_type.get(_STAT_CLEAN_SHEETS)),
    )
    raw = {"details": block.get("details")}
    return stat, sportmonks_statistic_id, raw
