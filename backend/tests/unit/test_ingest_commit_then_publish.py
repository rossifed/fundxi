"""Unit tests for the commit_then_publish helper.

These tests assert two invariants:

  1. ``session.commit()`` happens BEFORE any ``publisher.publish``.
     Reverse order is a silent correctness bug (subscribers refetch
     pre-commit state). The fake session records call order so we
     can pin the contract.

  2. Publish failures are isolated: a failing publish on one subject
     does not break the publishes of other subjects, and does not
     re-raise to the caller.
"""

from dataclasses import dataclass, field

import pytest

from src.ingest.application.commit_then_publish import commit_then_publish


@dataclass(slots=True)
class _FakeSession:
    log: list[str] = field(default_factory=list)
    commit_should_fail: bool = False

    async def commit(self) -> None:
        if self.commit_should_fail:
            raise RuntimeError("simulated DB commit failure")
        self.log.append("commit")


@dataclass(slots=True)
class _FakePublisher:
    log: list[str] = field(default_factory=list)
    fail_on_subject: str | None = None

    async def publish(self, subject: str, payload: bytes) -> None:
        _ = payload
        if subject == self.fail_on_subject:
            raise RuntimeError(f"simulated NATS publish failure on {subject}")
        self.log.append(f"publish:{subject}")


@pytest.mark.anyio
async def test_commit_runs_before_any_publish() -> None:
    session = _FakeSession()
    publisher = _FakePublisher()

    await commit_then_publish(
        session=session,  # type: ignore[arg-type]
        publisher=publisher,
        notifications=[
            ("fundxi.match_event.42", b"{}"),
            ("fundxi.match_comment.42", b"{}"),
        ],
    )

    # Commit must appear in the session log; publish entries in the publisher log.
    assert session.log == ["commit"]
    # Both publishes happened (order between them is irrelevant — gathered concurrently).
    assert sorted(publisher.log) == [
        "publish:fundxi.match_comment.42",
        "publish:fundxi.match_event.42",
    ]


@pytest.mark.anyio
async def test_no_publish_when_no_notifications() -> None:
    session = _FakeSession()
    publisher = _FakePublisher()

    await commit_then_publish(session=session, publisher=publisher, notifications=[])  # type: ignore[arg-type]

    assert session.log == ["commit"]
    assert publisher.log == []


@pytest.mark.anyio
async def test_failing_publish_is_swallowed_other_subjects_still_delivered() -> None:
    session = _FakeSession()
    publisher = _FakePublisher(fail_on_subject="fundxi.match_event.42")

    # Must not raise.
    await commit_then_publish(
        session=session,  # type: ignore[arg-type]
        publisher=publisher,
        notifications=[
            ("fundxi.match_event.42", b"{}"),  # fails
            ("fundxi.match_comment.42", b"{}"),  # succeeds
        ],
    )

    assert session.log == ["commit"]
    assert publisher.log == ["publish:fundxi.match_comment.42"]


@pytest.mark.anyio
async def test_commit_failure_does_not_publish_anything() -> None:
    session = _FakeSession(commit_should_fail=True)
    publisher = _FakePublisher()

    with pytest.raises(RuntimeError, match="commit failure"):
        await commit_then_publish(
            session=session,  # type: ignore[arg-type]
            publisher=publisher,
            notifications=[("fundxi.match_event.42", b"{}")],
        )

    # The whole point of "commit then publish": if commit raises, no publish leaks.
    assert publisher.log == []
