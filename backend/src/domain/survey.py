"""Survey domain — Value Object (read model).

DDD role: Value Object. A one-off question pushed to users for product
research (e.g. "would you invest real money?"). No behaviour; the per-user
answer (which doubles as the "seen" state) lives in the answer relation.
"""

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True, slots=True)
class SurveyQuestion:
    id: int
    code: str
    title: str
    body: str | None
    kind: str
    published_at: datetime
