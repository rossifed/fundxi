"""Pydantic response DTO for /api/news routes."""

from datetime import datetime

from pydantic import BaseModel

from src.domain.news.news import News


class NewsResponse(BaseModel):
    id: int
    fixture_id: int | None
    league_id: int | None
    title: str
    type: str
    published_at: datetime | None

    @classmethod
    def from_domain(cls, news: News) -> "NewsResponse":
        return cls(
            id=news.id,
            fixture_id=news.fixture_id,
            league_id=news.league_id,
            title=news.title,
            type=news.type.value,
            published_at=news.published_at,
        )
