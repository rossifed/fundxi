"""Pydantic DTOs for /api/me, /api/portfolio, /api/trades."""

from datetime import datetime

from pydantic import BaseModel


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
    shares: float
    price: float


class TradeOutcomeResponse(BaseModel):
    trade: TradeResponse
    portfolio: PortfolioResponse
