"""Aggregate import surface for Alembic autogenerate.

Importing this module registers all ORM classes on Base.metadata.
"""

from src.infrastructure.db.models.activity_event import ActivityEventORM
from src.infrastructure.db.models.announcement import AnnouncementAckORM, AnnouncementORM
from src.infrastructure.db.models.coach import CoachORM
from src.infrastructure.db.models.fixture import FixtureORM
from src.infrastructure.db.models.fixture_prediction import FixturePredictionORM
from src.infrastructure.db.models.fixture_state_event import FixtureStateEventORM
from src.infrastructure.db.models.league import LeagueMemberORM, LeagueORM
from src.infrastructure.db.models.lineup import LineupORM
from src.infrastructure.db.models.match_comment import MatchCommentORM
from src.infrastructure.db.models.match_comment_player_mention import MatchCommentPlayerMentionORM
from src.infrastructure.db.models.match_event import MatchEventORM
from src.infrastructure.db.models.news import NewsORM
from src.infrastructure.db.models.player import PlayerORM
from src.infrastructure.db.models.player_daily_snapshot import PlayerDailySnapshotORM
from src.infrastructure.db.models.player_match_stat import PlayerMatchStatORM
from src.infrastructure.db.models.player_price_tick import PlayerPriceTickORM
from src.infrastructure.db.models.portfolio import HoldingORM, PortfolioORM, TradeORM
from src.infrastructure.db.models.portfolio_value_snapshot import PortfolioValueSnapshotORM
from src.infrastructure.db.models.pricing_progress import PricingProgressORM
from src.infrastructure.db.models.raw_sportmonks_event import RawSportmonksEventORM
from src.infrastructure.db.models.standings import StandingORM
from src.infrastructure.db.models.team import TeamORM
from src.infrastructure.db.models.transfermarkt_market_value import TransfermarktMarketValueORM
from src.infrastructure.db.models.user import UserORM

__all__ = [
    "ActivityEventORM",
    "AnnouncementAckORM",
    "AnnouncementORM",
    "CoachORM",
    "FixtureORM",
    "FixturePredictionORM",
    "FixtureStateEventORM",
    "HoldingORM",
    "LeagueMemberORM",
    "LeagueORM",
    "LineupORM",
    "MatchCommentORM",
    "MatchCommentPlayerMentionORM",
    "MatchEventORM",
    "NewsORM",
    "PlayerDailySnapshotORM",
    "PlayerMatchStatORM",
    "PlayerORM",
    "PlayerPriceTickORM",
    "PortfolioORM",
    "PortfolioValueSnapshotORM",
    "PricingProgressORM",
    "RawSportmonksEventORM",
    "StandingORM",
    "TeamORM",
    "TradeORM",
    "TransfermarktMarketValueORM",
    "UserORM",
]
