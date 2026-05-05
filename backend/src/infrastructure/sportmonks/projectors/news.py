"""project_news — Sportmonks news payload → (News, sportmonks_id).

DDD role: Domain Service (pure function), Sportmonks-specific.

Assumed shape:
{
  "id": int,
  "fixture_id": int | null,
  "league_id": int | null,
  "title": str,
  "type": "prematch" | "postmatch"
}
"""

from datetime import datetime
from typing import Any

from src.domain.news.news import News, NewsType


def project_news(payload: dict[str, Any]) -> tuple[News, int, int | None]:
    """Returns (News domain entity, sportmonks news_id, sportmonks_fixture_id).

    The sportmonks_fixture_id is returned separately so the caller can resolve
    it to our internal fixture_id via a lookup.
    """
    sportmonks_id = payload["id"]
    if not isinstance(sportmonks_id, int):
        raise TypeError(f"news.id must be int, got {type(sportmonks_id).__name__}")

    title = payload.get("title")
    if not isinstance(title, str) or not title:
        raise ValueError(f"news payload missing title: {payload!r}")

    raw_type = payload.get("type")
    type_ = NewsType.PREMATCH
    if isinstance(raw_type, str) and raw_type in {NewsType.PREMATCH.value, NewsType.POSTMATCH.value}:
        type_ = NewsType(raw_type)

    league_id = payload.get("league_id") if isinstance(payload.get("league_id"), int) else None
    smk_fixture_id = payload.get("fixture_id") if isinstance(payload.get("fixture_id"), int) else None

    published_at_raw = payload.get("published_at") or payload.get("created_at")
    published_at: datetime | None = None
    if isinstance(published_at_raw, str):
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ"):
            try:
                published_at = datetime.strptime(published_at_raw, fmt)
                break
            except ValueError:
                continue

    news = News(
        id=0,  # filled by DB
        fixture_id=None,  # caller resolves via sportmonks_fixture_id
        league_id=league_id,
        title=title,
        type=type_,
        published_at=published_at,
    )
    return news, sportmonks_id, smk_fixture_id
