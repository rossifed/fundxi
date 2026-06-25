"""Announcement domain — Value Object (read model).

DDD role: Value Object. A pushed in-app message (release note / news). No
behaviour; the per-user "seen" state lives in the ack relation, not here.
"""

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True, slots=True)
class Announcement:
    id: int
    title: str
    body: str
    severity: str
    published_at: datetime
