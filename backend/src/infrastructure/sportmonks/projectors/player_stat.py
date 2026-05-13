"""project_player_stat — Sportmonks player.statistics block → PlayerTournamentStat.

DDD role: Domain Service (pure function). Maps a single statistics block
(one entry from `data.statistics[]` of a /players response) to our
domain Value Object.

Sportmonks v3 stat type IDs we surface as primary columns:
- 42  SHOTS_TOTAL
- 52  GOALS         (value: {total, goals, penalties})
- 79  ASSISTS
- 83  REDCARDS
- 84  YELLOWCARDS
- 86  SHOTS_ON_TARGET
- 117 KEY_PASSES
- 118 RATING        (value: {average, highest, lowest})
- 119 MINUTES_PLAYED
- 321 APPEARANCES

Anything else we receive lands in `raw_stats` as-is so we can surface
new metrics later without re-ingesting.
"""

from typing import Any

from src.domain.player.player_tournament_stat import PlayerTournamentStat

_STAT_GOALS = 52
_STAT_ASSISTS = 79
_STAT_RED_CARDS = 83
_STAT_YELLOW_CARDS = 84
_STAT_SHOTS_TOTAL = 42
_STAT_SHOTS_ON_TARGET = 86
_STAT_KEY_PASSES = 117
_STAT_RATING = 118
_STAT_MINUTES_PLAYED = 119
_STAT_APPEARANCES = 321


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
        red_cards=_total(by_type.get(_STAT_RED_CARDS)) or 0,
        shots_total=_total(by_type.get(_STAT_SHOTS_TOTAL)),
        shots_on_target=_total(by_type.get(_STAT_SHOTS_ON_TARGET)),
        key_passes=_total(by_type.get(_STAT_KEY_PASSES)),
        rating_avg=_average(by_type.get(_STAT_RATING)),
    )
    raw = {"details": block.get("details")}
    return stat, sportmonks_statistic_id, raw
