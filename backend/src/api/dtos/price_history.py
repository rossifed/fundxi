"""Pydantic DTO for /api/players/{id}/price-history."""

from datetime import datetime

from pydantic import BaseModel


class PricePoint(BaseModel):
    ts: datetime
    price: float
    fixture_id: int | None


class PriceHistoryResponse(BaseModel):
    player_id: int
    points: list[PricePoint]
