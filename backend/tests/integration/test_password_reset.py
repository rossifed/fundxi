"""Integration test — password-reset flow end-to-end against the live DB.

Exercises the real service (real session, real repos, real bcrypt) with a
capturing EmailSender so the test can read the token out of the link. Skipped
when Postgres is unreachable. The service commits, so the test deletes the
rows it created in a ``finally`` block to leave the DB clean.
"""

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime

import pytest
from sqlalchemy import delete

from src.application.password_reset_service import (
    InvalidResetTokenError,
    confirm_reset,
    request_reset,
)
from src.config import get_settings
from src.domain.auth.auth import Email, Password
from src.infrastructure.db.models.password_reset import PasswordResetORM
from src.infrastructure.db.models.user import UserORM
from src.infrastructure.security.passwords import hash_password, verify_password

pytestmark = pytest.mark.anyio

_TEST_EMAIL = "reset-flow-test@fundxi.local"


@dataclass
class CapturingSender:
    """Fake EmailSender that records every sent message."""

    sent: list[dict[str, str]] = field(default_factory=list)

    async def send(self, *, to: str, subject: str, html: str) -> None:
        self.sent.append({"to": to, "subject": subject, "html": html})


def _token_from_html(html: str) -> str:
    match = re.search(r"reset-password\?token=([A-Za-z0-9_\-]+)", html)
    assert match is not None, f"no reset token in email html: {html!r}"
    return match.group(1)


async def test_full_reset_flow_changes_password_and_consumes_token(isolated_session) -> None:
    session = isolated_session
    settings = get_settings()
    now = datetime(2026, 6, 8, 12, 0, 0, tzinfo=UTC)

    # Seed a minimal user with a known (old) password.
    user = UserORM(
        name=_TEST_EMAIL,
        kind="human",
        email=_TEST_EMAIL,
        password_hash=hash_password("old-password-123"),
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)

    try:
        sender = CapturingSender()
        await request_reset(
            session, email=Email.parse(_TEST_EMAIL), sender=sender, settings=settings, now=now
        )
        assert len(sender.sent) == 1
        assert sender.sent[0]["to"] == _TEST_EMAIL
        raw_token = _token_from_html(sender.sent[0]["html"])

        # Confirm with the captured token → password changes, token consumed,
        # password_changed_at stamped (which invalidates old sessions).
        await confirm_reset(
            session, raw_token=raw_token, new_password=Password("brand-new-pw-456"), now=now
        )
        await session.refresh(user)
        assert verify_password("brand-new-pw-456", user.password_hash or "")
        assert not verify_password("old-password-123", user.password_hash or "")
        assert user.password_changed_at is not None

        # The token is single-use: a replay is rejected.
        with pytest.raises(InvalidResetTokenError):
            await confirm_reset(
                session, raw_token=raw_token, new_password=Password("another-pw-789"), now=now
            )
    finally:
        await session.execute(delete(PasswordResetORM).where(PasswordResetORM.user_id == user.id))
        await session.execute(delete(UserORM).where(UserORM.id == user.id))
        await session.commit()


async def test_unknown_email_sends_nothing(isolated_session) -> None:
    session = isolated_session
    settings = get_settings()
    sender = CapturingSender()
    await request_reset(
        session,
        email=Email.parse("definitely-not-registered@fundxi.local"),
        sender=sender,
        settings=settings,
        now=datetime(2026, 6, 8, 12, 0, 0, tzinfo=UTC),
    )
    # No user ⇒ no token issued, no email sent — and crucially no raise, so
    # the caller cannot distinguish a registered from an unregistered email.
    assert sender.sent == []
