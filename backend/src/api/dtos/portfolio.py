"""Pydantic DTOs for /api/me, /api/portfolio, /api/trades."""

from datetime import datetime

from pydantic import BaseModel, Field


class UserResponse(BaseModel):
    id: int
    name: str
    kind: str


class HoldingResponse(BaseModel):
    player_id: int
    shares: float
    average_buy_price: float


class PortfolioResponse(BaseModel):
    id: int
    user_id: int
    cash: float
    holdings: list[HoldingResponse]


class TradeResponse(BaseModel):
    id: int
    portfolio_id: int
    player_id: int
    kind: str  # buy | sell
    shares: float
    price: float
    total: float
    executed_at: datetime


class TradeRequestBody(BaseModel):
    player_id: int
    kind: str  # buy | sell
    # Must be strictly positive: the share quantity carries the size, the kind
    # carries the direction. Rejected here with a clean 422 (defense in depth;
    # execute_trade also guards it). No upper bound — the margin rule caps size
    # economically.
    shares: float = Field(gt=0)
    # Advisory only (client's displayed price). The server executes at its
    # own authoritative latest tick — this value is NOT trusted. Optional so
    # clients may stop sending it.
    price: float | None = None


class TradeOutcomeResponse(BaseModel):
    trade: TradeResponse
    portfolio: PortfolioResponse
