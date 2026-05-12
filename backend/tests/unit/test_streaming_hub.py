"""Unit tests for the NotifyHub fan-out registry."""

import pytest

from src.streaming.application.hub import NotifyHub


@pytest.mark.anyio
async def test_dispatch_delivers_to_matching_topic_only() -> None:
    hub = NotifyHub(maxsize=10)
    fixture_q = hub.subscribe("fixture:42")
    other_q = hub.subscribe("fixture:99")

    await hub.dispatch("fundxi.match_event.42", b'{"count": 3}')

    assert fixture_q.get_nowait() == b'{"count": 3}'
    assert other_q.empty()


@pytest.mark.anyio
async def test_price_tick_fans_out_to_player_and_prices() -> None:
    hub = NotifyHub(maxsize=10)
    player_q = hub.subscribe("player:777")
    prices_q = hub.subscribe("prices")
    unrelated_q = hub.subscribe("player:1")

    await hub.dispatch("fundxi.player_price_tick.777", b'{"current_price": 15.5}')

    assert player_q.get_nowait() == b'{"current_price": 15.5}'
    assert prices_q.get_nowait() == b'{"current_price": 15.5}'
    assert unrelated_q.empty()


@pytest.mark.anyio
async def test_multiple_subscribers_on_same_topic_all_receive() -> None:
    hub = NotifyHub(maxsize=10)
    a = hub.subscribe("standings")
    b = hub.subscribe("standings")

    await hub.dispatch("fundxi.standings", b'{"count": 32}')

    assert a.get_nowait() == b'{"count": 32}'
    assert b.get_nowait() == b'{"count": 32}'


@pytest.mark.anyio
async def test_unsubscribe_stops_delivery_and_prunes_empty_topic() -> None:
    hub = NotifyHub(maxsize=10)
    q = hub.subscribe("fixture:42")
    assert hub.subscriber_count("fixture:42") == 1

    hub.unsubscribe("fixture:42", q)
    assert hub.subscriber_count("fixture:42") == 0
    assert hub.topic_count() == 0

    await hub.dispatch("fundxi.match_event.42", b"{}")
    assert q.empty()


@pytest.mark.anyio
async def test_dispatch_of_unmapped_subject_is_a_noop() -> None:
    hub = NotifyHub(maxsize=10)
    q = hub.subscribe("fixture:42")

    await hub.dispatch("fundxi.unknown.42", b"{}")
    await hub.dispatch("garbage", b"{}")

    assert q.empty()


@pytest.mark.anyio
async def test_full_queue_drops_oldest_keeps_newest() -> None:
    hub = NotifyHub(maxsize=2)
    q = hub.subscribe("prices")

    await hub.dispatch("fundxi.player_price_tick.1", b"first")
    await hub.dispatch("fundxi.player_price_tick.1", b"second")
    await hub.dispatch("fundxi.player_price_tick.1", b"third")  # overflow → drops "first"

    assert q.get_nowait() == b"second"
    assert q.get_nowait() == b"third"
    assert q.empty()


@pytest.mark.anyio
async def test_one_slow_subscriber_does_not_block_others() -> None:
    hub = NotifyHub(maxsize=1)
    slow = hub.subscribe("prices")  # never drained
    fast = hub.subscribe("prices")

    # Three dispatches; slow's queue overflows each time but never blocks.
    for i in range(3):
        await hub.dispatch("fundxi.player_price_tick.1", f"tick{i}".encode())
        # fast keeps up
        assert fast.get_nowait() == f"tick{i}".encode()

    # slow still holds exactly one (the last) message — no exception, no block.
    assert slow.qsize() == 1
    assert slow.get_nowait() == b"tick2"
