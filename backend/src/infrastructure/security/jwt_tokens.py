"""JWT session token adapter.

DDD role: Adapter. Issues short-lived JWTs (HS256) carrying a
single ``sub`` claim (the user id) and the standard ``iat`` / ``exp``.
We don't store refresh tokens server-side: when the access token
expires the user logs back in. Simple, stateless, BFF-compatible
(token stays in the HTTP-only cookie).
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import jwt


@dataclass(frozen=True, slots=True)
class SessionClaims:
    user_id: int
    issued_at: int  # JWT ``iat`` — epoch seconds


@dataclass(frozen=True, slots=True)
class JwtIssuer:
    secret: str
    ttl_seconds: int = 60 * 60 * 24 * 30  # 30 days

    def issue(self, user_id: int) -> str:
        now = int(time.time())
        return jwt.encode(
            {"sub": str(user_id), "iat": now, "exp": now + self.ttl_seconds},
            self.secret,
            algorithm="HS256",
        )

    def verify(self, token: str) -> int | None:
        """Return the user id when the token is valid, ``None`` otherwise."""
        claims = self.verify_claims(token)
        return claims.user_id if claims is not None else None

    def verify_claims(self, token: str) -> SessionClaims | None:
        """Return the validated ``(user_id, issued_at)`` claims, or ``None``.

        ``issued_at`` (the JWT ``iat``) lets callers reject tokens minted
        before a security-relevant event such as a password reset."""
        try:
            payload = jwt.decode(token, self.secret, algorithms=["HS256"])
        except (jwt.InvalidTokenError, jwt.ExpiredSignatureError):
            return None
        sub = payload.get("sub")
        iat = payload.get("iat")
        if not isinstance(sub, str) or not sub.isdigit() or not isinstance(iat, int):
            return None
        return SessionClaims(user_id=int(sub), issued_at=iat)
