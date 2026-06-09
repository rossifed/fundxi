"""Password-reset service — request + confirm.

DDD role: Application Service. Orchestrates the auth domain (Email/Password
value objects), the user + password-reset repositories, the token adapter,
the password hasher and the email sender. Two use cases:

- ``request_reset`` — issue a token and email the link. Caller-facing result
  is intentionally void and never reveals whether the email is registered
  (no enumeration). A send failure is logged, not surfaced.
- ``confirm_reset`` — validate the token (exists, not expired, not used),
  set the new password and stamp ``password_changed_at`` (which invalidates
  every existing session JWT), then mark the token used.

Time is injected (``now``) so the rules are deterministically testable.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import structlog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import Settings
from src.domain.auth.auth import Email, Password
from src.infrastructure.db.models.password_reset import PasswordResetORM
from src.infrastructure.db.models.user import UserORM
from src.infrastructure.db.repositories.password_reset import SqlAlchemyPasswordResetRepository
from src.infrastructure.email.sender import EmailError, EmailSender
from src.infrastructure.security.passwords import hash_password
from src.infrastructure.security.reset_tokens import generate_token, hash_token

log = structlog.get_logger(__name__)

# Don't issue a fresh token if the last one for this user is younger than
# this — cheap anti-abuse so repeated "forgot" clicks don't spam the inbox.
RESEND_THROTTLE_SECONDS = 60


class InvalidResetTokenError(Exception):
    """The reset token is unknown, expired or already used."""


def is_token_usable(reset: PasswordResetORM | None, *, now: datetime) -> bool:
    """Pure validity rule: a token is usable iff it exists, has not been
    used, and has not expired. Extracted so the security-critical predicate
    is unit-testable without a database."""
    return reset is not None and reset.used_at is None and reset.expires_at > now


async def request_reset(
    session: AsyncSession,
    *,
    email: Email,
    sender: EmailSender,
    settings: Settings,
    now: datetime,
) -> None:
    """Issue a reset token for ``email`` and mail the link. Always succeeds
    from the caller's point of view (no enumeration leak)."""
    row = await session.execute(select(UserORM).where(UserORM.email == email.value))
    user = row.scalar_one_or_none()
    if user is None:
        return  # Unknown email — say nothing, do nothing.

    repo = SqlAlchemyPasswordResetRepository(session)

    last = await repo.latest_for_user(user.id)
    if last is not None and last.used_at is None:
        age = (now - last.created_at).total_seconds()
        if age < RESEND_THROTTLE_SECONDS:
            log.info("password_reset.throttled", user_id=user.id, age_seconds=age)
            return

    raw = generate_token()
    expires_at = now + timedelta(seconds=settings.password_reset_ttl_seconds)
    await repo.create(user_id=user.id, token_hash=hash_token(raw), expires_at=expires_at)
    await session.commit()

    link = f"{settings.app_base_url.rstrip('/')}/reset-password?token={raw}"
    try:
        await sender.send(
            to=email.value,
            subject="Reset your fundXI password",
            html=_reset_email_html(link),
        )
    except EmailError:
        # The token is persisted; the user can retry the request. Surfacing
        # the provider failure would leak that the email exists, so we keep
        # the generic success and just log.
        log.warning("password_reset.email_failed", user_id=user.id)


async def confirm_reset(
    session: AsyncSession,
    *,
    raw_token: str,
    new_password: Password,
    now: datetime,
) -> None:
    """Validate the token and set the new password. Raises
    ``InvalidResetTokenError`` if the token is unknown, expired or used."""
    repo = SqlAlchemyPasswordResetRepository(session)
    reset = await repo.get_by_token_hash(hash_token(raw_token))
    if not is_token_usable(reset, now=now):
        raise InvalidResetTokenError()
    assert reset is not None  # narrowed by is_token_usable

    await session.execute(
        update(UserORM)
        .where(UserORM.id == reset.user_id)
        .values(password_hash=hash_password(new_password.value), password_changed_at=now)
    )
    await repo.mark_used(reset, used_at=now)
    await session.commit()


def _reset_email_html(link: str) -> str:
    return (
        f'<p>You asked to reset your fundXI password.</p>'
        f'<p><a href="{link}">Choose a new password</a></p>'
        f'<p>This link expires in 1 hour. If you did not request this, ignore this email.</p>'
    )
