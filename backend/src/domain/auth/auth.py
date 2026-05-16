"""Auth domain — Value Objects and pure rules.

DDD role: Value Objects + Domain Service (pure). All side-effecting
work (DB lookups, password hashing, JWT signing) lives in adapters.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# RFC 5322-lite — good enough to catch the obvious typos; final
# validation is the email link / 2FA flow which we don't have yet.
_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")

MIN_PASSWORD_LENGTH = 8


class InvalidEmailError(ValueError):
    pass


class InvalidPasswordError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class Email:
    """Email Value Object — normalised + validated at construction."""

    value: str

    def __post_init__(self) -> None:
        if not _EMAIL_RE.match(self.value):
            raise InvalidEmailError(f"invalid email format: {self.value!r}")

    @classmethod
    def parse(cls, raw: str) -> Email:
        return cls(value=raw.strip().lower())


@dataclass(frozen=True, slots=True)
class Password:
    """Plain-text password — never logged, never persisted. Hashing
    happens in the infrastructure adapter, not here."""

    value: str

    def __post_init__(self) -> None:
        if len(self.value) < MIN_PASSWORD_LENGTH:
            raise InvalidPasswordError(
                f"password must be at least {MIN_PASSWORD_LENGTH} characters"
            )
