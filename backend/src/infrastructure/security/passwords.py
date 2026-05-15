"""Password hashing adapter — bcrypt.

DDD role: Adapter. Wraps the bcrypt primitive so the rest of the code
never touches the lib directly. ``hash_password`` produces a bcrypt
hash string (~60 chars); ``verify_password`` is constant-time inside
bcrypt.
"""

from __future__ import annotations

import bcrypt

BCRYPT_ROUNDS = 12  # standard 2024 default; ~250ms per hash on commodity CPU


def hash_password(plain: str) -> str:
    salted = bcrypt.gensalt(rounds=BCRYPT_ROUNDS)
    return bcrypt.hashpw(plain.encode("utf-8"), salted).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        # Malformed hash → fail closed.
        return False
