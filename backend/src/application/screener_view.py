"""Screener read model — Application Service (CQRS query side).

DDD role: Read-model query service. Builds the single-shot Screener payload:
one row per ``core.player`` decorated with its latest valuation, the
pre-tournament anchor (for the all-time %), the most-recent-fixture net %, the
tournament-stat aggregate, and — for the authenticated caller only — the
held position P&L. Players with no tick yet still appear, priced at their
deterministic synthetic base value.

This is a read model: it owns one wide query plus the display-derivation rules
(synthetic fallback, P&L, average per-match) that used to live in the router,
so the HTTP layer is left with nothing but auth resolution and DTO mapping. No
mutation, no commit.

The fields of ``ScreenerEntry`` mirror ``PlayerScreenerEntryResponse`` exactly,
so the router maps with a single ``Response(**asdict(entry))``.
"""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.valuation.synthetic_valuation_provider import synthesize_valuation

_SCREENER_SQL = text(
    """
    WITH latest_tick AS (
      SELECT DISTINCT ON (player_id)
        player_id, ts, current_price, performance_rating, change_since_open, source
      FROM valuation.player_price_tick
      ORDER BY player_id, ts DESC
    ),
    anchor AS (
      -- Pre-tournament baseline: the earliest fixture_id IS NULL
      -- tick (base_value, 0%). Falls back to the earliest tick
      -- overall for legacy data with no baseline. Same anchor
      -- EngineValuationProvider divides by, so screener and the
      -- valuation provider report an identical total.
      SELECT DISTINCT ON (player_id)
        player_id, current_price AS anchor_price
      FROM valuation.player_price_tick
      ORDER BY player_id, (fixture_id IS NOT NULL) ASC, ts ASC
    )
    SELECT
      p.id, p.name, p.full_name, p.jersey_number, p.team_id, p.position,
      p.detailed_position, p.age, p.foot, p.height, p.weight, p.club, p.image_path,
      lt.current_price, lt.performance_rating,
      lt.ts AS valuation_as_of, lt.source AS valuation_source,
      an.anchor_price,
      CASE
        WHEN an.anchor_price IS NOT NULL AND an.anchor_price > 0
        THEN ((lt.current_price - an.anchor_price) / an.anchor_price) * 100.0
        ELSE NULL
      END AS since_start_pct,
      lm.net_pct AS last_match_pct,
      ts.appearances, ts.minutes_played, ts.goals, ts.assists,
      ts.yellow_cards, ts.red_cards, ts.shots_total, ts.shots_on_target,
      ts.key_passes, ts.passes_total, ts.passes_accuracy, ts.rating_avg,
      COALESCE(h.shares, 0) AS held_shares,
      h.average_buy_price
    FROM core.player p
    LEFT JOIN latest_tick lt ON lt.player_id = p.id
    LEFT JOIN anchor an ON an.player_id = p.id
    LEFT JOIN core.player_tournament_stat ts
      ON ts.player_id = p.id AND ts.season_id = :season_id
    LEFT JOIN app.holding h
      ON h.player_id = p.id AND h.portfolio_id = :portfolio_id
    LEFT JOIN LATERAL (
      -- Net % of the player's MOST RECENT fixture: compound the
      -- per-event deltas (product of (1+d/100), minus 1), i.e.
      -- close-vs-open of that match -- NOT the last single
      -- event's delta (which made a whole team look red when the
      -- match's final event was a goal conceded, even in a win).
      SELECT (EXP(SUM(LN(1 + t.change_since_open / 100.0))) - 1) * 100.0 AS net_pct
      FROM valuation.player_price_tick t
      WHERE t.player_id = p.id
        AND t.fixture_id = (
          SELECT fixture_id
          FROM valuation.player_price_tick
          WHERE player_id = p.id AND fixture_id IS NOT NULL
          ORDER BY ts DESC
          LIMIT 1
        )
    ) lm ON TRUE
    ORDER BY lt.current_price DESC NULLS LAST, p.id
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
    season_id: int,
    portfolio_id: int | None,
    now: datetime,
) -> list[ScreenerEntry]:
    """Run the screener query and apply the display-derivation rules.

    ``portfolio_id`` scopes the held-position columns; pass ``None`` for an
    anonymous caller (held_shares 0, average_buy_price/pnl NULL). ``now`` is
    used both for the synthetic fallback price and as the as-of of un-ticked
    players (kept as an argument so the function stays deterministic/testable).
    """
    rows = await session.execute(_SCREENER_SQL, {"season_id": season_id, "portfolio_id": portfolio_id})

    entries: list[ScreenerEntry] = []
    for r in rows.mappings():
        # No tick yet (hasn't played / no pricing event) → deterministic
        # synthetic base value, so the player still appears on the screener.
        if r["current_price"] is not None:
            current_price = float(r["current_price"])
            performance_rating = float(r["performance_rating"])
            valuation_as_of = r["valuation_as_of"]
            valuation_source = r["valuation_source"]
        else:
            current_price = synthesize_valuation(r["id"], as_of=now).base_value
            performance_rating = 6.5
            valuation_as_of = now
            valuation_source = "synthetic"

        shares = float(r["held_shares"] or 0)
        avg_buy = float(r["average_buy_price"]) if r["average_buy_price"] is not None else None
        pnl = shares * (current_price - avg_buy) if shares != 0 and avg_buy is not None else None

        since_start = r["since_start_pct"]
        apps = r["appearances"]
        avg_match = float(since_start) / apps if since_start is not None and apps else None

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
                current_price=current_price,
                performance_rating=performance_rating,
                valuation_as_of=valuation_as_of,
                valuation_source=valuation_source,
                since_start_pct=float(since_start) if since_start is not None else None,
                last_match_pct=float(r["last_match_pct"]) if r["last_match_pct"] is not None else None,
                avg_match_pct=avg_match,
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
    return entries
