"""Password-reset token adapter.

DDD role: Adapter. A reset token is an opaque, single-use secret mailed
to the user. We treat it like a password: the raw value goes in the email
link and is never stored; only its SHA-256 digest is persisted, so a DB
leak never yields a usable token. Lookup is by digest (the user presents
the raw token, we hash it and match).

SHA-256 (not bcrypt) is the right primitive here: the token already has
256 bits of entropy from ``secrets.token_urlsafe`` — there is nothing to
brute-force, so the slow-hash cost bcrypt buys against weak passwords is
pointless. A fast digest with a constant-time compare is correct.
"""

from __future__ import annotations

import hashlib
import secrets

# 32 bytes → ~43-char url-safe string. Far beyond guessable.
_TOKEN_BYTES = 32


def generate_token() -> str:
    """Return a fresh opaque url-safe token (the raw value for the email)."""
    return secrets.token_urlsafe(_TOKEN_BYTES)


def hash_token(raw: str) -> str:
    """SHA-256 hex digest of the raw token — what we persist and look up by."""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
