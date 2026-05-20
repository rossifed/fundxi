"""Pydantic DTOs for /api/portfolio/history.

The wire format mirrors the domain ``PortfolioSnapshot`` value object
one-to-one. ``ts`` is serialised as ISO-8601 (FastAPI default for
``datetime``).
"""

from datetime import datetime

from pydantic import BaseModel


class PortfolioHistoryPoint(BaseModel):
    ts: datetime
    cash: float
    holdings_value: float
    value: float
    pnl_vs_open: float


class PortfolioHistoryResponse(BaseModel):
    portfolio_id: int
    range: str
    points: list[PortfolioHistoryPoint]
