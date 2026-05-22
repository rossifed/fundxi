"""Pydantic response DTOs for the /api/teams routes.

DDD role: API contract DTOs. Decoupled from domain entities so the HTTP shape
can evolve independently. Mirrors the frontend `Team` TypeScript type.
"""

from pydantic import BaseModel

from src.domain.team.team import Team


class TeamResponse(BaseModel):
    id: str
    name: str
    flag: str
    color: str
    kind: str
    continent: str | None = None
    group: str | None = None
    coach_name: str | None = None
    coach_image_path: str | None = None
    coach_nationality: str | None = None

    @classmethod
    def from_domain(cls, team: Team) -> "TeamResponse":
        return cls(
            id=team.id,
            name=team.name,
            flag=team.flag,
            color=team.color,
            kind=team.kind.value,
            continent=team.continent,
            group=team.group,
            coach_name=team.coach_name,
            coach_image_path=team.coach_image_path,
            coach_nationality=team.coach_nationality,
        )
