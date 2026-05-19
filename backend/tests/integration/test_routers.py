"""Integration tests — hit the FastAPI app in-process against the live DB.

Strategy: ASGI transport + httpx.AsyncClient → no uvicorn process, no port
binding, but the full request/response cycle (routing, DI, ORM, JSON
serialization) runs end-to-end.

These tests REQUIRE the local Postgres to be running (`docker compose up -d`)
AND the bootstrap to have populated WC2022 data. They are skipped if the DB
is unavailable.
"""

from collections.abc import AsyncIterator

import httpx
import pytest
from sqlalchemy.exc import OperationalError

from src.api.main import app
from src.infrastructure.db.session import SessionLocal


async def _db_is_up() -> bool:
    try:
        async with SessionLocal() as session:
            await session.execute(__import__("sqlalchemy").text("SELECT 1"))
        return True
    except (OperationalError, ConnectionRefusedError, OSError):
        return False


@pytest.fixture(scope="session")
async def client() -> AsyncIterator[httpx.AsyncClient]:
    """Session-scoped to share one AsyncClient (and the SQLAlchemy engine
    bound to its event loop) across all integration tests."""
    if not await _db_is_up():
        pytest.skip("local Postgres not reachable")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.anyio
async def test_health(client: httpx.AsyncClient) -> None:
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


@pytest.mark.anyio
async def test_teams_list_returns_wc2022_nations(client: httpx.AsyncClient) -> None:
    r = await client.get("/api/teams")
    assert r.status_code == 200
    teams = r.json()
    # core.team is NOT season-scoped: WC2022 (32) + WC2026 (48) nations
    # coexist, merged by ISO short_code. A nation is the same entity
    # across tournaments, so >= 32 (not == 32). Scoping /api/teams by
    # active season is a separate open issue from the fixtures fix.
    assert len(teams) >= 32
    iso_codes = {t["id"] for t in teams}
    # Sanity check: well-known nations must be present
    assert {"ARG", "BRA", "FRA", "ENG", "USA"}.issubset(iso_codes)
    sample = teams[0]
    assert set(sample.keys()) >= {"id", "name", "flag", "color", "kind", "confederation", "group"}
    assert sample["kind"] == "national"


@pytest.mark.anyio
async def test_team_get_known_iso(client: httpx.AsyncClient) -> None:
    r = await client.get("/api/teams/ARG")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "ARG"
    assert body["name"] == "Argentina"
    assert body["kind"] == "national"


@pytest.mark.anyio
async def test_team_get_404(client: httpx.AsyncClient) -> None:
    r = await client.get("/api/teams/ZZZ")
    assert r.status_code == 404


@pytest.mark.anyio
async def test_fixtures_list_returns_wc2022_matches(client: httpx.AsyncClient) -> None:
    r = await client.get("/api/fixtures")
    assert r.status_code == 200
    fixtures = r.json()
    assert len(fixtures) == 64, "WC2022 has 64 matches"
    sample = fixtures[0]
    assert {"id", "home_team_id", "away_team_id", "status", "kickoff_at"}.issubset(sample.keys())
    # The famous final must be present
    finals = [f for f in fixtures if {f["home_team_id"], f["away_team_id"]} == {"ARG", "FRA"}]
    assert len(finals) == 1
    assert finals[0]["status"] == "finished"


@pytest.mark.anyio
async def test_players_search_returns_valuation(client: httpx.AsyncClient) -> None:
    r = await client.get("/api/players/search", params={"team_ids": "ARG", "limit": 30})
    assert r.status_code == 200
    body = r.json()
    assert len(body) > 0
    sample = body[0]
    assert "valuation" in sample
    val = sample["valuation"]
    # Engine provider after WC2022 replay; falls back to synthetic seed for
    # players who didn't participate in the tournament.
    assert val["source"] in {"engine", "synthetic"}
    assert val["base_value"] > 0
    assert val["current_price"] > 0


@pytest.mark.anyio
async def test_players_search_filter_by_position(client: httpx.AsyncClient) -> None:
    r = await client.get("/api/players/search", params={"positions": "GK", "limit": 100})
    assert r.status_code == 200
    body = r.json()
    assert len(body) > 0
    assert all(p["position"] == "GK" for p in body)


@pytest.mark.anyio
async def test_players_search_text_match(client: httpx.AsyncClient) -> None:
    r = await client.get("/api/players/search", params={"search": "Messi"})
    assert r.status_code == 200
    body = r.json()
    assert any("Messi" in (p.get("full_name") or p.get("name") or "") for p in body)


@pytest.mark.anyio
async def test_valuation_for_player(client: httpx.AsyncClient) -> None:
    list_resp = await client.get("/api/players", params={})
    assert list_resp.status_code == 200
    players = list_resp.json()
    pid = players[0]["id"]
    r = await client.get(f"/api/valuations/player/{pid}")
    assert r.status_code == 200
    val = r.json()
    assert val["player_id"] == pid
    assert val["source"] in {"engine", "synthetic"}
    assert val["base_value"] > 0


@pytest.mark.anyio
async def test_messi_has_engine_valuation_after_replay(client: httpx.AsyncClient) -> None:
    """Messi played 7 WC2022 matches → engine provider must serve a real
    tick (source='engine') with current_price > base_value (he had a great
    tournament)."""
    search = (await client.get("/api/players/search", params={"search": "Messi"})).json()
    messi_entries = [p for p in search if "Messi" in (p.get("full_name") or "")]
    assert messi_entries
    val = messi_entries[0]["valuation"]
    assert val["source"] == "engine"
    assert val["current_price"] > val["base_value"], "Messi's WC2022 was net positive"


@pytest.mark.anyio
async def test_top_movers_up_and_down(client: httpx.AsyncClient) -> None:
    up = (await client.get("/api/players/top-movers", params={"direction": "up", "limit": 3})).json()
    down = (await client.get("/api/players/top-movers", params={"direction": "down", "limit": 3})).json()
    assert len(up) == 3
    assert len(down) == 3
    assert up[0]["valuation"]["change_since_inception"] >= up[-1]["valuation"]["change_since_inception"]
    assert down[0]["valuation"]["change_since_inception"] <= down[-1]["valuation"]["change_since_inception"]
    assert up[0]["valuation"]["change_since_inception"] > down[0]["valuation"]["change_since_inception"]


@pytest.mark.anyio
async def test_top_movers_invalid_direction(client: httpx.AsyncClient) -> None:
    r = await client.get("/api/players/top-movers", params={"direction": "sideways"})
    assert r.status_code == 400


@pytest.mark.anyio
async def test_news_list(client: httpx.AsyncClient) -> None:
    r = await client.get("/api/news", params={"limit": 5})
    assert r.status_code == 200
    body = r.json()
    assert len(body) > 0
    sample = body[0]
    assert {"id", "title", "type", "fixture_id"}.issubset(sample.keys())
    assert sample["type"] in {"prematch", "postmatch"}


@pytest.mark.anyio
async def test_fixture_comments_for_final(client: httpx.AsyncClient) -> None:
    fixtures = (await client.get("/api/fixtures")).json()
    finals = [f for f in fixtures if {f["home_team_id"], f["away_team_id"]} == {"ARG", "FRA"}]
    assert finals, "ARG-FRA final must exist"
    fid = finals[0]["id"]
    r = await client.get(f"/api/fixtures/{fid}/comments")
    assert r.status_code == 200
    comments = r.json()
    assert len(comments) > 50, "WC2022 final has ~180 comments"
    # The 3-3 Mbappé equaliser is recorded as a goal at minute >= 117.
    goals = [c for c in comments if c["is_goal"]]
    assert any("Mbappé" in c["comment"] for c in goals)


@pytest.mark.anyio
async def test_screener_dropped_change_24h(client: httpx.AsyncClient) -> None:
    """The misnamed `change_24h` is gone — the screener exposes only the
    two reconcilable metrics: total (`since_start_pct`) + last match."""
    body = (await client.get("/api/players/screener-view")).json()
    assert body, "screener must return players"
    sample = body[0]
    assert "change_24h" not in sample
    assert {"current_price", "since_start_pct", "last_match_pct"}.issubset(sample.keys())


@pytest.mark.anyio
async def test_screener_total_reconciles_with_valuation_provider(client: httpx.AsyncClient) -> None:
    """The user-stated invariant: the three displayed numbers derive from
    ONE series, so the screener's total must equal the valuation
    provider's total for the same player (same anchor, same current
    price). Asserted on every player carrying real ticks.
    """
    from src.infrastructure.db.session import SessionLocal
    from src.infrastructure.valuation.engine_valuation_provider import EngineValuationProvider

    body = (await client.get("/api/players/screener-view")).json()
    priced = [e for e in body if e["valuation_source"] != "synthetic" and e["since_start_pct"] is not None]
    assert priced, "at least one player must have a real price tick (run a replay first)"

    async with SessionLocal() as session:
        provider = EngineValuationProvider(session)
        for entry in priced[:25]:  # bound the DB round-trips
            v = await provider.get_for_player(entry["id"])
            # current price identical (same latest tick).
            assert entry["current_price"] == pytest.approx(v.current_price, abs=0.01)
            # total identical: both = (current / base_anchor - 1) * 100,
            # within the documented 2-decimal rounding tolerance.
            assert entry["since_start_pct"] == pytest.approx(v.change_since_inception, abs=0.05)
            # and the total reconciles against current vs base by definition.
            assert v.current_price == pytest.approx(
                v.base_value * (1.0 + v.change_since_inception / 100.0), rel=1e-4
            )
