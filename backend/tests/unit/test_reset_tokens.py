"""Unit tests for the password-reset token adapter and validity rule.

The token adapter is pure (no I/O), so these run without a database. The
``is_token_usable`` predicate is the security-critical gate — every branch
(unknown / used / expired / valid) is exercised here.
"""

import hashlib
from datetime import UTC, datetime, timedelta

from src.application.password_reset_service import is_token_usable
from src.infrastructure.db.models.password_reset import PasswordResetORM
from src.infrastructure.security.reset_tokens import generate_token, hash_token

NOW = datetime(2026, 6, 8, 12, 0, 0, tzinfo=UTC)


def test_generate_token_is_unique_and_substantial() -> None:
    tokens = {generate_token() for _ in range(100)}
    assert len(tokens) == 100  # no collisions
    assert all(len(t) >= 40 for t in tokens)  # 32 bytes url-safe ⇒ ~43 chars


def test_hash_token_is_sha256_hex_and_deterministic() -> None:
    raw = "a-fixed-token-value"
    digest = hash_token(raw)
    assert digest == hashlib.sha256(raw.encode("utf-8")).hexdigest()
    assert len(digest) == 64
    assert hash_token(raw) == digest  # deterministic
    assert hash_token("other") != digest


def _reset(*, used_at: datetime | None, expires_at: datetime) -> PasswordResetORM:
    return PasswordResetORM(user_id=1, token_hash="x", expires_at=expires_at, used_at=used_at)


def test_is_token_usable_none_is_rejected() -> None:
    assert is_token_usable(None, now=NOW) is False


def test_is_token_usable_used_is_rejected() -> None:
    reset = _reset(used_at=NOW - timedelta(minutes=1), expires_at=NOW + timedelta(hours=1))
    assert is_token_usable(reset, now=NOW) is False


def test_is_token_usable_expired_is_rejected() -> None:
    reset = _reset(used_at=None, expires_at=NOW - timedelta(seconds=1))
    assert is_token_usable(reset, now=NOW) is False


def test_is_token_usable_expiry_boundary_is_exclusive() -> None:
    # expires_at == now ⇒ no longer usable (strictly greater required).
    reset = _reset(used_at=None, expires_at=NOW)
    assert is_token_usable(reset, now=NOW) is False


def test_is_token_usable_fresh_unused_is_accepted() -> None:
    reset = _reset(used_at=None, expires_at=NOW + timedelta(hours=1))
    assert is_token_usable(reset, now=NOW) is True
