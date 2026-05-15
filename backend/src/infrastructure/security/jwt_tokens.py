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
        try:
            payload = jwt.decode(token, self.secret, algorithms=["HS256"])
        except (jwt.InvalidTokenError, jwt.ExpiredSignatureError):
            return None
        sub = payload.get("sub")
        if not isinstance(sub, str) or not sub.isdigit():
            return None
        return int(sub)
