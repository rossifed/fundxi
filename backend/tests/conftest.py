"""Shared pytest configuration."""

import pytest


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    """Session-scoped event loop so SQLAlchemy's async engine (created once at
    import time) keeps working across tests instead of being orphaned by a
    closed loop."""
    return "asyncio"
