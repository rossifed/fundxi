"""Pydantic response DTOs for the /api/standings routes.

DDD role: API contract DTOs. Enriches the bare ``Standing`` Value
Object with the team's display name and flag so the frontend's
group-table widget needs a single request.
"""

from pydantic import BaseModel

from src.domain.match.standing import Standing
from src.domain.team.team import Team


class StandingRowResponse(BaseModel):
    team_id: str
    team_name: str
    flag: str
    position: int
    played: int
    won: int
    drawn: int
    lost: int
    goals_for: int
    goals_against: int
    goal_difference: int
    points: int

    @classmethod
    def from_domain(cls, standing: Standing, team: Team | None) -> "StandingRowResponse":
        return cls(
            team_id=standing.team_id,
            team_name=team.name if team else standing.team_id,
            flag=team.flag if team else "",
            position=standing.position,
            played=standing.played,
            won=standing.won,
            drawn=standing.drawn,
            lost=standing.lost,
            goals_for=standing.goals_for,
            goals_against=standing.goals_against,
            goal_difference=standing.goal_difference,
            points=standing.points,
        )


class GroupStandingResponse(BaseModel):
    group: str
    rows: list[StandingRowResponse]
