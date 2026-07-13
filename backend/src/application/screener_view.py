"""Screener read model — Application Service (CQRS query side).

DDD role: Read-model query service. Builds the single-shot Screener payload:
one row per ``core.player`` decorated with its valuation, the tournament-stat
aggregate, and — for the authenticated caller only — the held position P&L.

The valuation fields (current price, % since start, last/avg match %, rating,
as-of, source) are NOT computed here: they come from the single
``ValuationProvider`` read-model that also feeds top-movers / search, so the two
surfaces can never disagree on a player's numbers. This service only joins the
non-valuation data (identity, tournament stats, holdings) and merges in the
valuation, then derives the per-holding P&L.

The fields of ``ScreenerEntry`` mirror ``PlayerScreenerEntryResponse`` exactly,
so the router maps with a single ``Response(**asdict(entry))``.
"""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.valuation.valuation_provider import ValuationProvider

_SCREENER_SQL = text(
    """
    SELECT
      p.id, p.name, p.full_name, p.jersey_number, p.team_id, p.position,
      p.detailed_position, p.age, p.foot, p.height, p.weight, p.club, p.image_path,
      ts.appearances, ts.minutes_played, ts.goals, ts.assists,
      -- Cards are event-derived (core.player_season_discipline, live and
      -- timeline-coherent), never the Sportmonks aggregate columns. A player
      -- with a stat row but no card row genuinely has 0 cards; without a stat
      -- row the whole stat slice stays NULL (never featured).
      CASE WHEN ts.player_id IS NOT NULL THEN COALESCE(sd.yellow_cards, 0) END AS yellow_cards,
      CASE WHEN ts.player_id IS NOT NULL THEN COALESCE(sd.red_cards, 0) END AS red_cards,
      ts.shots_total, ts.shots_on_target,
      ts.key_passes, ts.passes_total, ts.passes_accuracy, ts.rating_avg,
      COALESCE(h.shares, 0) AS held_shares,
      h.average_buy_price
    FROM core.player p
    LEFT JOIN core.player_tournament_stat ts
      ON ts.player_id = p.id AND ts.season_id = :season_id
    LEFT JOIN core.player_season_discipline sd
      ON sd.player_id = p.id AND sd.season_id = :season_id
    LEFT JOIN app.holding h
      ON h.player_id = p.id AND h.portfolio_id = :portfolio_id
    ORDER BY p.id
    """
)


@dataclass(frozen=True, slots=True)
class ScreenerEntry:
    """One screener row. Field names mirror ``PlayerScreenerEntryResponse``."""

    id: int
    name: str
    full_name: str | None
    jersey_number: int
    team_id: str
    position: str
    detailed_position: str | None
    age: int | None
    foot: str | None
    height: int | None
    weight: int | None
    club: str | None
    image_path: str | None

    current_price: float
    performance_rating: float
    valuation_as_of: datetime
    valuation_source: str

    since_start_pct: float | None
    last_match_pct: float | None
    avg_match_pct: float | None

    appearances: int | None
    minutes_played: int | None
    goals: int | None
    assists: int | None
    yellow_cards: int | None
    red_cards: int | None
    shots_total: int | None
    shots_on_target: int | None
    key_passes: int | None
    passes_total: int | None
    passes_accuracy: float | None
    rating_avg: float | None

    held_shares: float
    average_buy_price: float | None
    pnl: float | None


async def load_screener_view(
    session: AsyncSession,
    *,
    valuation_provider: ValuationProvider,
    season_id: int,
    portfolio_id: int | None,
) -> list[ScreenerEntry]:
    """Join non-valuation data, merge the shared valuation read-model, derive P&L.

    ``portfolio_id`` scopes the held-position columns; pass ``None`` for an
    anonymous caller (held_shares 0, average_buy_price/pnl NULL). Valuation
    (including the deterministic synthetic fallback for un-ticked players) is
    owned by ``valuation_provider`` — never recomputed here.
    """
    result = await session.execute(_SCREENER_SQL, {"season_id": season_id, "portfolio_id": portfolio_id})
    rows = list(result.mappings())
    valuations = await valuation_provider.get_for_players([r["id"] for r in rows])

    entries: list[ScreenerEntry] = []
    for r in rows:
        val = valuations[r["id"]]

        shares = float(r["held_shares"] or 0)
        avg_buy = float(r["average_buy_price"]) if r["average_buy_price"] is not None else None
        pnl = shares * (val.current_price - avg_buy) if shares != 0 and avg_buy is not None else None

        entries.append(
            ScreenerEntry(
                id=r["id"],
                name=r["name"],
                full_name=r["full_name"],
                jersey_number=r["jersey_number"],
                team_id=r["team_id"],
                position=r["position"],
                detailed_position=r["detailed_position"],
                age=r["age"],
                foot=r["foot"],
                height=r["height"],
                weight=r["weight"],
                club=r["club"],
                image_path=r["image_path"],
                current_price=val.current_price,
                performance_rating=val.performance_rating,
                valuation_as_of=val.as_of,
                valuation_source=val.source.value,
                since_start_pct=val.change_since_inception,
                last_match_pct=val.change_last_match,
                avg_match_pct=val.change_avg_per_match,
                appearances=r["appearances"],
                minutes_played=r["minutes_played"],
                goals=r["goals"],
                assists=r["assists"],
                yellow_cards=r["yellow_cards"],
                red_cards=r["red_cards"],
                shots_total=r["shots_total"],
                shots_on_target=r["shots_on_target"],
                key_passes=r["key_passes"],
                passes_total=r["passes_total"],
                passes_accuracy=float(r["passes_accuracy"]) if r["passes_accuracy"] is not None else None,
                rating_avg=float(r["rating_avg"]) if r["rating_avg"] is not None else None,
                held_shares=shares,
                average_buy_price=avg_buy,
                pnl=pnl,
            )
        )

    # Default order = richest first (the UI re-sorts/filters in memory anyway).
    entries.sort(key=lambda e: e.current_price, reverse=True)
    return entries
