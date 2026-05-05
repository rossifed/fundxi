"""/api/news router."""

from fastapi import APIRouter, Depends, Query

from src.api.dependencies import get_news_repo
from src.api.dtos.news import NewsResponse
from src.infrastructure.db.repositories.news import SqlAlchemyNewsRepository

router = APIRouter(prefix="/api/news", tags=["news"])


@router.get("", response_model=list[NewsResponse])
async def news_list(
    limit: int = Query(default=20, ge=1, le=100),
    repo: SqlAlchemyNewsRepository = Depends(get_news_repo),
) -> list[NewsResponse]:
    items = await repo.list_recent(limit=limit)
    return [NewsResponse.from_domain(n) for n in items]
