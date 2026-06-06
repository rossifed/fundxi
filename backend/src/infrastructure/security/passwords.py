"""Password hashing adapter — bcrypt.

DDD role: Adapter. Wraps the bcrypt primitive so the rest of the code
never touches the lib directly. ``hash_password`` produces a bcrypt
hash string (~60 chars); ``verify_password`` is constant-time inside
bcrypt.
"""

from __future__ import annotations

import bcrypt

BCRYPT_ROUNDS = 12  # standard 2024 default; ~250ms per hash on commodity CPU

# A valid, throwaway bcrypt hash (same cost factor) used to spend the same
# CPU time on a login attempt for a non-existent / password-less account as
# for a real one. Prevents the timing side channel that would otherwise let
# an attacker enumerate registered emails. Not a secret — it hashes a fixed
# dummy string and is never a valid credential.
_DUMMY_HASH = "$2b$12$.ryV72aKngOYu.vIVnCoQecWy.wdyb04Z38BgJQ8hdRD14BmQZmmm"


def hash_password(plain: str) -> str:
    salted = bcrypt.gensalt(rounds=BCRYPT_ROUNDS)
    return bcrypt.hashpw(plain.encode("utf-8"), salted).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        # Malformed hash → fail closed.
        return False


def dummy_verify(plain: str) -> None:
    """Run a bcrypt verify against a throwaway hash and discard the result.

    Called on the unknown-email / no-password-set login branch so the
    request takes ~the same time as a real verify (constant-time login,
    no user-enumeration oracle)."""
    verify_password(plain, _DUMMY_HASH)
