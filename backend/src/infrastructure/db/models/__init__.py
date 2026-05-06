"""Aggregate import surface for Alembic autogenerate.

Importing this module registers all ORM classes on Base.metadata.
"""

from src.infrastructure.db.models.fixture import FixtureORM
from src.infrastructure.db.models.lineup import LineupORM
from src.infrastructure.db.models.match_comment import MatchCommentORM
from src.infrastructure.db.models.match_comment_player_mention import MatchCommentPlayerMentionORM
from src.infrastructure.db.models.match_event import MatchEventORM
from src.infrastructure.db.models.news import NewsORM
from src.infrastructure.db.models.player import PlayerORM
from src.infrastructure.db.models.player_daily_snapshot import PlayerDailySnapshotORM
from src.infrastructure.db.models.player_price_tick import PlayerPriceTickORM
from src.infrastructure.db.models.portfolio import HoldingORM, PortfolioORM, TradeORM
from src.infrastructure.db.models.raw_sportmonks_event import RawSportmonksEventORM
from src.infrastructure.db.models.team import TeamORM
from src.infrastructure.db.models.user import UserORM

__all__ = [
    "FixtureORM",
    "HoldingORM",
    "LineupORM",
    "MatchCommentORM",
    "MatchCommentPlayerMentionORM",
    "MatchEventORM",
    "NewsORM",
    "PlayerDailySnapshotORM",
    "PlayerORM",
    "PlayerPriceTickORM",
    "PortfolioORM",
    "RawSportmonksEventORM",
    "TeamORM",
    "TradeORM",
    "UserORM",
]
