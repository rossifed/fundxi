"""Unit tests for the raw event hash helper (idempotency key)."""

from src.infrastructure.db.repositories.raw_sportmonks_event import hash_response


def test_hash_response_is_stable_across_key_order() -> None:
    a = {"x": 1, "y": [2, 3], "z": {"nested": True}}
    b = {"z": {"nested": True}, "y": [2, 3], "x": 1}
    assert hash_response(a) == hash_response(b)


def test_hash_response_changes_with_value() -> None:
    a = {"x": 1}
    b = {"x": 2}
    assert hash_response(a) != hash_response(b)


def test_hash_response_changes_with_nested_value() -> None:
    a = {"data": [{"id": 1}, {"id": 2}]}
    b = {"data": [{"id": 1}, {"id": 3}]}
    assert hash_response(a) != hash_response(b)


def test_hash_response_is_hex_sha256_length() -> None:
    assert len(hash_response({"x": 1})) == 64


def test_hash_response_ignores_envelope_metadata() -> None:
    """rate_limit / subscription / timezone differ on every call but must not
    break (endpoint, response_hash) idempotency."""
    base = {"data": [{"id": 1, "name": "X"}]}
    a = {**base, "rate_limit": {"remaining": 2999, "resets_in_seconds": 3500}, "timezone": "UTC"}
    b = {**base, "rate_limit": {"remaining": 2998, "resets_in_seconds": 3499}, "timezone": "UTC"}
    assert hash_response(a) == hash_response(b)
