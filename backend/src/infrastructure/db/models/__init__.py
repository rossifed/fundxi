"""Aggregate import surface for Alembic autogenerate.

Importing this module registers all ORM classes on Base.metadata.
"""

from src.infrastructure.db.models.fixture import FixtureORM
from src.infrastructure.db.models.match_comment import MatchCommentORM
from src.infrastructure.db.models.match_comment_player_mention import MatchCommentPlayerMentionORM
from src.infrastructure.db.models.news import NewsORM
from src.infrastructure.db.models.player import PlayerORM
from src.infrastructure.db.models.raw_sportmonks_event import RawSportmonksEventORM
from src.infrastructure.db.models.team import TeamORM

__all__ = [
    "FixtureORM",
    "MatchCommentORM",
    "MatchCommentPlayerMentionORM",
    "NewsORM",
    "PlayerORM",
    "RawSportmonksEventORM",
    "TeamORM",
]
