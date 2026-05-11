"""fundXI Simulation Control Panel.

DDD role: Adapter (driving). A Streamlit web app that wires the same
Use Cases the CLI does, exposing them through buttons, sliders and a
live progress panel.

Decoupled from the React main app: separate process, separate port
(default 8501), reads / writes only via the database. The main app
has no knowledge that this control panel exists.

Install (one-shot):
    uv sync --group simulation-gui

Run:
    uv run streamlit run src/simulation/gui/streamlit_app.py
"""

import asyncio
import threading
from dataclasses import dataclass, replace
from datetime import datetime
from time import sleep

import streamlit as st
from sqlalchemy import select

from src.infrastructure.db.models.fixture import FixtureORM
from src.infrastructure.db.repositories.fixture import SqlAlchemyFixtureRepository
from src.infrastructure.db.repositories.match_comment import SqlAlchemyMatchCommentRepository
from src.infrastructure.db.repositories.match_event import SqlAlchemyMatchEventRepository
from src.infrastructure.db.session import SessionLocal
from src.simulation.application.replay_match import replay_match
from src.simulation.application.wipe_replay_state import wipe_replay_state
from src.simulation.domain.ports import LiveDataSink, PlayerPriceTickWriter
from src.simulation.domain.replay_event import ReplayEvent, ReplayEventKind
from src.simulation.domain.wipe_scope import WipeScope
from src.simulation.infrastructure.pg_archive_reader import SqlAlchemyReplayArchiveReader
from src.simulation.infrastructure.pg_price_tick_writer import SqlAlchemyPlayerPriceTickWriter
from src.simulation.infrastructure.pg_wipe_executor import SqlAlchemyWipeExecutor
from src.simulation.infrastructure.price_tick_sink import PriceTickEmittingSink
from src.simulation.infrastructure.projector_sink import ProjectorSink
from src.simulation.infrastructure.replay_context import (
    load_fixture_kickoff,
    load_initial_price_state,
    load_sportmonks_id_maps,
)

# ---------------------------------------------------------------------------
# Process-wide progress state.
#
# Streamlit's ``st.session_state`` does not cross threads, so we use a
# module-level dataclass guarded by a lock. The Streamlit script reads
# it on each rerun; the background replay thread writes to it.
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class _ReplayProgress:
    is_running: bool = False
    fixture_label: str = ""
    current_minute: int = 0
    extra_minute: int | None = None
    comments_emitted: int = 0
    events_emitted: int = 0
    ticks_emitted: int = 0
    error: str | None = None
    done: bool = False


_PROGRESS = _ReplayProgress()
_PROGRESS_LOCK = threading.Lock()


def _snapshot_progress() -> _ReplayProgress:
    with _PROGRESS_LOCK:
        return replace(_PROGRESS)


def _reset_progress(*, fixture_label: str) -> None:
    with _PROGRESS_LOCK:
        _PROGRESS.is_running = True
        _PROGRESS.fixture_label = fixture_label
        _PROGRESS.current_minute = 0
        _PROGRESS.extra_minute = None
        _PROGRESS.comments_emitted = 0
        _PROGRESS.events_emitted = 0
        _PROGRESS.ticks_emitted = 0
        _PROGRESS.error = None
        _PROGRESS.done = False


# ---------------------------------------------------------------------------
# Streamlit-specific driving-side decorators.
#
# These mirror the CLI's ``_CliSink`` but report into ``_PROGRESS``
# instead of structlog. Private to the GUI: real-time visibility is a
# wiring-layer concern.
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class _GuiSink:
    """Commits per minute boundary and tallies comments / events."""

    inner: LiveDataSink
    session: object  # AsyncSession, kept opaque to avoid an extra import
    _last_minute: int | None = None

    async def emit(self, event: ReplayEvent, *, fixture_internal_id: int) -> None:
        if self._last_minute is not None and event.minute != self._last_minute:
            await self.session.commit()  # type: ignore[attr-defined]
        await self.inner.emit(event, fixture_internal_id=fixture_internal_id)
        with _PROGRESS_LOCK:
            _PROGRESS.current_minute = event.minute
            _PROGRESS.extra_minute = event.extra_minute
            if event.kind is ReplayEventKind.MATCH_COMMENT:
                _PROGRESS.comments_emitted += 1
            elif event.kind is ReplayEventKind.MATCH_EVENT:
                _PROGRESS.events_emitted += 1
        self._last_minute = event.minute


@dataclass(slots=True)
class _CountingTickWriter:
    """Decorates a ``PlayerPriceTickWriter`` to count inserts."""

    inner: PlayerPriceTickWriter

    async def insert(
        self,
        *,
        player_id: int,
        ts: datetime,
        fixture_id: int | None,
        current_price: float,
        performance_rating: float,
        change_since_open: float,
    ) -> None:
        await self.inner.insert(
            player_id=player_id,
            ts=ts,
            fixture_id=fixture_id,
            current_price=current_price,
            performance_rating=performance_rating,
            change_since_open=change_since_open,
        )
        with _PROGRESS_LOCK:
            _PROGRESS.ticks_emitted += 1


# ---------------------------------------------------------------------------
# Async work units invoked by the Streamlit buttons.
# ---------------------------------------------------------------------------


@dataclass(slots=True, frozen=True)
class _FixtureChoice:
    smk_id: int
    kickoff: datetime
    label: str


async def _load_fixture_choices() -> list[_FixtureChoice]:
    async with SessionLocal() as session:
        rows = (
            await session.execute(
                select(
                    FixtureORM.sportmonks_id,
                    FixtureORM.kickoff_at,
                    FixtureORM.home_team_id,
                    FixtureORM.away_team_id,
                )
                .where(FixtureORM.sportmonks_id.is_not(None))
                .where(FixtureORM.kickoff_at.is_not(None))
                .order_by(FixtureORM.kickoff_at)
            )
        ).all()
    choices: list[_FixtureChoice] = []
    for row in rows:
        if row.sportmonks_id is None or row.kickoff_at is None:
            continue
        teams = " vs ".join(t for t in (row.home_team_id, row.away_team_id) if t) or "?"
        label = f"{row.kickoff_at.strftime('%Y-%m-%d %H:%M')} — {teams} (#{row.sportmonks_id})"
        choices.append(_FixtureChoice(smk_id=row.sportmonks_id, kickoff=row.kickoff_at, label=label))
    return choices


async def _run_wipe(scope: WipeScope) -> None:
    async with SessionLocal() as session:
        executor = SqlAlchemyWipeExecutor(session=session)
        await wipe_replay_state(executor, scope)
        await session.commit()


async def _run_replay(*, fixture_smk_id: int, speed: float, from_minute: int) -> None:
    async with SessionLocal() as session:
        fixtures_repo = SqlAlchemyFixtureRepository(session)
        archive = SqlAlchemyReplayArchiveReader(session=session, fixtures=fixtures_repo)
        player_id_by_smk, team_id_by_smk = await load_sportmonks_id_maps(session)
        kickoff = await load_fixture_kickoff(session, fixture_sportmonks_id=fixture_smk_id)
        price_state = await load_initial_price_state(session, as_of=kickoff)

        projector_sink = ProjectorSink(
            comments=SqlAlchemyMatchCommentRepository(session),
            events=SqlAlchemyMatchEventRepository(session),
            player_id_by_sportmonks=player_id_by_smk,
            team_id_by_sportmonks=team_id_by_smk,
        )
        pricing_sink = PriceTickEmittingSink(
            inner=projector_sink,
            price_ticks=_CountingTickWriter(inner=SqlAlchemyPlayerPriceTickWriter(session=session)),
            price_state=price_state,
            fixture_kickoff=kickoff,
            player_id_by_sportmonks=player_id_by_smk,
            team_id_by_sportmonks=team_id_by_smk,
        )
        sink = _GuiSink(inner=pricing_sink, session=session)

        await replay_match(
            fixture_sportmonks_id=fixture_smk_id,
            speed=speed,
            from_minute=from_minute,
            archive=archive,
            sink=sink,
            sleep=asyncio.sleep,
        )
        await session.commit()


def _start_replay_in_thread(*, fixture_smk_id: int, fixture_label: str, speed: float, from_minute: int) -> None:
    """Kick off the async replay on a fresh event loop in a daemon thread.

    The thread reports progress through the module-level ``_PROGRESS``;
    Streamlit's main thread reads it on each rerun without ever calling
    the use case directly.
    """

    def runner() -> None:
        try:
            asyncio.run(
                _run_replay(
                    fixture_smk_id=fixture_smk_id,
                    speed=speed,
                    from_minute=from_minute,
                )
            )
        except Exception as exc:
            with _PROGRESS_LOCK:
                _PROGRESS.error = f"{type(exc).__name__}: {exc}"
        finally:
            with _PROGRESS_LOCK:
                _PROGRESS.is_running = False
                _PROGRESS.done = True

    _reset_progress(fixture_label=fixture_label)
    threading.Thread(target=runner, daemon=True).start()


# ---------------------------------------------------------------------------
# Streamlit UI.
# ---------------------------------------------------------------------------

st.set_page_config(page_title="fundXI Simulation", layout="centered")
st.title("fundXI — Simulation Control Panel")
st.caption("Replay recorded fixtures into the live store at controlled speed.")

# Reset
st.subheader("Reset")
col_left, col_right = st.columns(2)
if col_left.button("Wipe simulation data", use_container_width=True):
    asyncio.run(_run_wipe(WipeScope.DATA_ONLY))
    st.success("Simulation data wiped — events, comments, ticks, derived stats.")
if col_right.button("Wipe + portfolio", use_container_width=True):
    asyncio.run(_run_wipe(WipeScope.FULL))
    st.success("Everything wiped including portfolio / holdings / trades.")
    st.info(
        "Run `uv run python -m src.infrastructure.workers.bootstrap_user` "
        "to recreate the default portfolio before trading again."
    )

st.divider()

# Replay
st.subheader("Replay")
try:
    fixtures = asyncio.run(_load_fixture_choices())
except Exception as exc:
    st.error(f"Could not load fixtures from DB: {exc}")
    fixtures = []

if not fixtures:
    st.warning("No fixtures with a kickoff time were found in `core.fixture`.")
else:
    progress = _snapshot_progress()
    labels = [f.label for f in fixtures]
    # Default to the last fixture (WC2022 final, by chronological sort).
    selected_label = st.selectbox("Fixture", labels, index=len(labels) - 1)
    selected = next(f for f in fixtures if f.label == selected_label)
    speed = st.slider(
        "Speed (game minutes per real second)",
        min_value=1,
        max_value=600,
        value=60,
        step=1,
        help=(
            "1 = real time (90 min match → 90 min wall-clock). "
            "60 = 1 game minute per real second. "
            "600 = ~9 seconds for the whole 90 minutes."
        ),
    )
    from_minute = st.number_input("Start at minute", min_value=0, max_value=130, value=0)

    if st.button(
        "Start replay",
        type="primary",
        disabled=progress.is_running,
        use_container_width=True,
    ):
        _start_replay_in_thread(
            fixture_smk_id=selected.smk_id,
            fixture_label=selected.label,
            speed=float(speed),
            from_minute=int(from_minute),
        )
        st.rerun()

st.divider()

# Status
st.subheader("Status")
snap = _snapshot_progress()

if snap.fixture_label:
    st.write(f"**Fixture:** {snap.fixture_label}")

minute_label = f"{snap.current_minute}"
if snap.extra_minute:
    minute_label += f"+{snap.extra_minute}"
m1, m2, m3, m4 = st.columns(4)
m1.metric("Minute", minute_label)
m2.metric("Comments", snap.comments_emitted)
m3.metric("Events", snap.events_emitted)
m4.metric("Price ticks", snap.ticks_emitted)

if snap.is_running:
    st.info("Replay in progress…")
    sleep(1)
    st.rerun()
elif snap.done:
    if snap.error:
        st.error(f"Replay failed — {snap.error}")
    else:
        st.success("Replay completed.")
elif not snap.fixture_label:
    st.caption("No replay started yet.")
