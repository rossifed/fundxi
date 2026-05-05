"""One-shot helper: find Sportmonks league + season ids for the World Cup.

Usage:
    uv run python -m scripts.discover_season

Reads SPORTMONKS_API_TOKEN from .env. Prints league_id for "FIFA World Cup"
and the season_ids known to that league (WC2022, WC2026 if available).
"""

import asyncio
import json

from src.config import get_settings
from src.infrastructure.sportmonks.client import HttpxSportmonksClient


async def run() -> None:
    settings = get_settings()
    if not settings.sportmonks_api_token:
        raise SystemExit("SPORTMONKS_API_TOKEN not set")

    async with HttpxSportmonksClient(
        base_url=settings.sportmonks_base_url,
        api_token=settings.sportmonks_api_token,
    ) as client:
        # 1) find the league by name
        leagues = await client.get(
            "/leagues/search/world cup",
            params={"include": "seasons"},
        )
        data = leagues.get("data") or []
        if not isinstance(data, list):
            print("unexpected /leagues response shape")
            print(json.dumps(leagues, indent=2)[:1500])
            return

        for league in data:
            if not isinstance(league, dict):
                continue
            name = league.get("name", "?")
            league_id = league.get("id")
            country_id = league.get("country_id")
            print(f"\n=== league_id={league_id}  name={name!r}  country_id={country_id} ===")
            seasons = league.get("seasons") or []
            if isinstance(seasons, list):
                for season in seasons:
                    if not isinstance(season, dict):
                        continue
                    print(
                        f"  season_id={season.get('id'):<8}  "
                        f"name={season.get('name')!r:<14}  "
                        f"is_current={season.get('is_current')}  "
                        f"starting_at={season.get('starting_at')}  "
                        f"ending_at={season.get('ending_at')}"
                    )


if __name__ == "__main__":
    asyncio.run(run())
