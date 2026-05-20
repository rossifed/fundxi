"""fundXI Simulation Control Panel.

DDD role: Adapter (driving). A Streamlit web app that wires the same
Use Cases the CLI does, exposing them through buttons, sliders and a
live progress panel.

Decoupled from the React main app: separate process, separate port
(default 8501), reads / writes only via the database. The main app
has no knowledge that this control panel exists.

Install (one-shot):
    uv sync --group simulation-gui

Run (from the backend/ directory):
    uv run streamlit run src/simulation/gui/streamlit_app.py
"""

import asyncio
import contextlib
import os
import sys
import threading
from dataclasses import dataclass, replace
from datetime import datetime
from pathlib import Path
from time import monotonic, sleep

# `streamlit run` puts the *script's* directory on sys.path, not the project
# root, so `import src.*` would fail. Add backend/ (this file is at
# backend/src/simulation/gui/streamlit_app.py → parents[3]) to the path.
_BACKEND_ROOT = Path(__file__).resolve().parents[3]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

import streamlit as st
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from src.config import get_settings
from src.infrastructure.db.models.fixture import FixtureORM
from src.infrastructure.db.repositories.fixture import SqlAlchemyFixtureRepository
from src.infrastructure.db.repositories.match_comment import SqlAlchemyMatchCommentRepository
from src.infrastructure.db.repositories.match_event import SqlAlchemyMatchEventRepository
from src.infrastructure.db.session import SessionLocal
from src.infrastructure.messaging.nats_publisher import NatsPublisher
from src.simulation.application.replay_match import replay_match
from src.simulation.application.wipe_replay_state import wipe_fixture_replay_state, wipe_replay_state
from src.simulation.domain.ports import LiveDataSink
from src.simulation.domain.replay_event import ReplayEvent, ReplayEventKind
from src.simulation.domain.wipe_scope import WipeScope
from src.simulation.infrastructure.buffering_publisher import BufferingPublisher
from src.simulation.infrastructure.fixture_progress_sink import FixtureProgressSink
from src.simulation.infrastructure.fixture_status_publisher import publish_fixture_status
from src.simulation.infrastructure.nats_publishing_sink import NatsPublishingSink
from src.simulation.infrastructure.pg_archive_reader import SqlAlchemyReplayArchiveReader
from src.simulation.infrastructure.pg_fixture_progress_writer import SqlAlchemyFixtureProgressWriter
from src.simulation.infrastructure.pg_wipe_executor import SqlAlchemyWipeExecutor
from src.simulation.infrastructure.projector_sink import ProjectorSink
from src.simulation.infrastructure.replay_context import (
    acquire_replay_lock,
    ensure_fixture_idle,
    load_fixture_kickoff,
    load_fixture_rosters,
    load_initial_price_state,
    load_sportmonks_id_maps,
    release_replay_lock,
    seed_baseline_ticks,
)
from src.simulation.infrastructure.synthetic_minute_pricing_sink import SyntheticMinutePricingSink

_DEFAULT_NATS_SERVERS = "nats://localhost:4222"


def _nats_server_list() -> tuple[str, ...]:
    return tuple(s.strip() for s in os.getenv("SIM_NATS_SERVERS", _DEFAULT_NATS_SERVERS).split(",") if s.strip())


# ---------------------------------------------------------------------------
# Async plumbing for Streamlit.
#
# Streamlit re-executes the script on every interaction. Using
# ``asyncio.run()`` per call would create a throw-away event loop each
# time — and asyncpg connections (pooled or not) bound to a closed loop
# blow up with "TCPTransport closed" / "Event loop is closed". So we
# keep ONE persistent loop for the whole Streamlit process (cached as a
# resource), and run short DB calls on it via ``_run_async``. The
# shared ``SessionLocal`` (pooled) is then safe: every connection it
# pools stays bound to that single loop.
#
# The replay runs in a *background thread* (so it doesn't block the UI):
# that thread can't touch this loop's connections, so ``_run_replay``
# uses its own NullPool engine, created and disposed within the thread.
# ---------------------------------------------------------------------------


@st.cache_resource
def _persistent_loop() -> asyncio.AbstractEventLoop:
    loop = asyncio.new_event_loop()
    return loop


def _run_async(coro: object) -> object:
    return _persistent_loop().run_until_complete(coro)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Process-wide replay runtime.
#
# Streamlit re-executes the script top to bottom on every interaction, so
# any *module-level* mutable state would be re-created on each rerun — the
# background replay thread would then be updating an object the UI no
# longer reads. We therefore hold the shared state behind
# ``@st.cache_resource``, which is created once per process and returns
# the *same* instance to every rerun (and to the replay thread). It
# bundles: the progress snapshot, the lock that guards it, and two
# ``threading.Event``s the UI flips to pause / stop an in-flight replay.
#
# ``st.cache_resource`` must only be touched from the Streamlit script
# thread; the replay thread receives the runtime as a plain argument.
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class _ReplayProgress:
    is_running: bool = False
    is_paused: bool = False
    aborted: bool = False
    fixture_label: str = ""
    current_minute: int = 0
    extra_minute: int | None = None
    comments_emitted: int = 0
    events_emitted: int = 0
    ticks_emitted: int = 0
    error: str | None = None
    done: bool = False


@dataclass(slots=True)
class _ReplayRuntime:
    progress: _ReplayProgress
    lock: threading.Lock
    stop_event: threading.Event
    pause_event: threading.Event


@st.cache_resource
def _runtime() -> _ReplayRuntime:
    return _ReplayRuntime(
        progress=_ReplayProgress(),
        lock=threading.Lock(),
        stop_event=threading.Event(),
        pause_event=threading.Event(),
    )


def _snapshot_progress(runtime: _ReplayRuntime) -> _ReplayProgress:
    with runtime.lock:
        # ``is_paused`` is owned by the UI (the pause Event), not the
        # replay thread — reflect it into the snapshot for display.
        return replace(runtime.progress, is_paused=runtime.pause_event.is_set())


def _reset_progress(runtime: _ReplayRuntime, *, fixture_label: str) -> None:
    runtime.stop_event.clear()
    runtime.pause_event.clear()
    with runtime.lock:
        runtime.progress = _ReplayProgress(is_running=True, fixture_label=fixture_label)


# ---------------------------------------------------------------------------
# Streamlit-specific driving-side decorators.
#
# These mirror the CLI's ``_CliSink`` but report into the shared
# ``_ReplayRuntime`` instead of structlog, and ``_GuiReplayController``
# bridges the pause/stop Events into the use case. Private to the GUI:
# real-time visibility and out-of-band control are wiring concerns.
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class _GuiSink:
    """Per game-minute: commit-then-publish that minute (live-faithful
    ordering), then advance the displayed clock to the just-COMMITTED
    minute. The GUI therefore shows exactly what the app can read — GUI,
    Home and Fixtures stay in lockstep, no minute runs ahead."""

    inner: LiveDataSink
    session: AsyncSession
    runtime: _ReplayRuntime
    buffering: BufferingPublisher
    _last_minute: int | None = None
    _last_extra: int | None = None

    async def emit(self, event: ReplayEvent, *, fixture_internal_id: int) -> None:
        if self._last_minute is not None and event.minute != self._last_minute:
            await self.buffering.flush(self.session)
            with self.runtime.lock:
                # Show only the minute now durably committed & published.
                self.runtime.progress.current_minute = self._last_minute
                self.runtime.progress.extra_minute = self._last_extra
        await self.inner.emit(event, fixture_internal_id=fixture_internal_id)
        with self.runtime.lock:
            p = self.runtime.progress
            if event.kind is ReplayEventKind.MATCH_COMMENT:
                p.comments_emitted += 1
            elif event.kind is ReplayEventKind.MATCH_EVENT:
                p.events_emitted += 1
        self._last_minute = event.minute
        self._last_extra = event.extra_minute


@dataclass(slots=True)
class _GuiReplayController:
    """``ReplayController`` adapter driven by two ``threading.Event``s.

    The Streamlit thread flips the events from a button click; the
    replay thread observes them at each game-minute boundary.
    """

    stop_event: threading.Event
    pause_event: threading.Event

    def stop_requested(self) -> bool:
        return self.stop_event.is_set()

    async def wait_while_paused(self) -> None:
        while self.pause_event.is_set() and not self.stop_event.is_set():
            await asyncio.sleep(0.2)


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
                # Only fixtures actually replayable: their raw archive
                # must hold BOTH includes the replay reader loads
                # (events.type;lineups.position AND comments). Future
                # tournaments live in core.fixture too but have only the
                # comments include (from bootstrap_comments) — they
                # would 'LookupError: no raw archive...' on launch.
                .where(
                    text(
                        "EXISTS (SELECT 1 FROM raw.sportmonks_event e "
                        "WHERE e.endpoint = '/fixtures/' || core.fixture.sportmonks_id::text "
                        "AND e.params->>'include' IN ('events.type;lineups.position','comments') "
                        "GROUP BY e.endpoint "
                        "HAVING count(DISTINCT e.params->>'include') = 2)"
                    )
                )
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


async def _run_wipe_fixture(fixture_smk_id: int) -> None:
    async with SessionLocal() as session:
        internal_id = (
            await session.execute(select(FixtureORM.id).where(FixtureORM.sportmonks_id == fixture_smk_id))
        ).scalar_one_or_none()
        if internal_id is None:
            raise LookupError(f"No fixture with sportmonks_id={fixture_smk_id} in core.fixture")
        executor = SqlAlchemyWipeExecutor(session=session)
        await wipe_fixture_replay_state(executor, internal_id)
        await session.commit()


async def _run_replay(*, runtime: _ReplayRuntime, fixture_smk_id: int, speed: float, from_minute: int) -> None:
    # Runs in a background thread with its own event loop — must NOT touch
    # the persistent loop's pooled connections. A self-contained NullPool
    # engine, opened and disposed inside this thread, sidesteps that.
    engine = create_async_engine(get_settings().database_url, poolclass=NullPool)
    session_local = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    try:
        async with (
            session_local() as session,
            NatsPublisher(servers=_nats_server_list(), name="fundxi-simulation-gui") as publisher,
        ):
            # Buffer notifications; flush (commit-then-publish) per minute.
            buffering = BufferingPublisher(inner=publisher)
            await acquire_replay_lock(session)
            try:
                await ensure_fixture_idle(session, fixture_sportmonks_id=fixture_smk_id)
                fixtures_repo = SqlAlchemyFixtureRepository(session)
                archive = SqlAlchemyReplayArchiveReader(session=session, fixtures=fixtures_repo)
                player_id_by_smk, team_id_by_smk = await load_sportmonks_id_maps(session)
                kickoff = await load_fixture_kickoff(session, fixture_sportmonks_id=fixture_smk_id)
                rosters = await load_fixture_rosters(session, fixture_sportmonks_id=fixture_smk_id)
                price_state = await load_initial_price_state(session, as_of=kickoff)
                await seed_baseline_ticks(session, price_state)

                projector_sink = ProjectorSink(
                    comments=SqlAlchemyMatchCommentRepository(session),
                    events=SqlAlchemyMatchEventRepository(session),
                    player_id_by_sportmonks=player_id_by_smk,
                    team_id_by_sportmonks=team_id_by_smk,
                )
                # Per-minute synthetic-rating pricing through THE canonical
                # kernel (WC2022 has no real per-minute rating; ticks tagged
                # source="rehearsal"). Same kernel the live poller uses.
                pricing_sink = SyntheticMinutePricingSink(
                    inner=projector_sink,
                    session=session,
                    publisher=buffering,
                    rosters=rosters,
                    base_price_by_player=price_state.current_price_by_player,
                    fixture_kickoff=kickoff,
                    player_id_by_sportmonks=player_id_by_smk,
                    team_id_by_sportmonks=team_id_by_smk,
                )
                progress_writer = SqlAlchemyFixtureProgressWriter(session=session)
                # FixtureProgressSink inside NatsPublishingSink: the fixture row
                # (clock / score) is updated before the per-event ping is sent.
                sink = _GuiSink(
                    inner=NatsPublishingSink(
                        inner=FixtureProgressSink(inner=pricing_sink, progress=progress_writer),
                        publisher=buffering,
                    ),
                    session=session,
                    runtime=runtime,
                    buffering=buffering,
                )

                report = await replay_match(
                    fixture_sportmonks_id=fixture_smk_id,
                    speed=speed,
                    from_minute=from_minute,
                    archive=archive,
                    sink=sink,
                    sleep=asyncio.sleep,
                    controller=_GuiReplayController(stop_event=runtime.stop_event, pause_event=runtime.pause_event),
                )
                # Price the final minute (no later event triggers its boundary).
                await pricing_sink.finalize(report.fixture_internal_id)
                await progress_writer.finish(fixture_internal_id=report.fixture_internal_id)
                # Final flush: commit the last minute + drain its buffered
                # notifications, then reflect the final committed minute.
                await buffering.flush(session)
                with runtime.lock:
                    runtime.progress.current_minute = sink._last_minute or runtime.progress.current_minute
                    runtime.progress.extra_minute = sink._last_extra
                await publish_fixture_status(
                    publisher, fixture_internal_id=report.fixture_internal_id, status="finished"
                )
            finally:
                await release_replay_lock(session)
    finally:
        with contextlib.suppress(Exception):
            await engine.dispose()


def _start_replay_in_thread(
    runtime: _ReplayRuntime, *, fixture_smk_id: int, fixture_label: str, speed: float, from_minute: int
) -> None:
    """Kick off the async replay on a fresh event loop in a daemon thread.

    The thread reports progress through the shared ``runtime`` (created
    on the Streamlit thread and passed in here); Streamlit's main thread
    reads it on each rerun without ever calling the use case directly.
    """

    def runner() -> None:
        aborted = False
        try:
            asyncio.run(
                _run_replay(
                    runtime=runtime,
                    fixture_smk_id=fixture_smk_id,
                    speed=speed,
                    from_minute=from_minute,
                )
            )
            aborted = runtime.stop_event.is_set()
        except Exception as exc:
            with runtime.lock:
                runtime.progress.error = f"{type(exc).__name__}: {exc}"
        finally:
            with runtime.lock:
                runtime.progress.is_running = False
                runtime.progress.done = True
                runtime.progress.aborted = aborted

    _reset_progress(runtime, fixture_label=fixture_label)
    threading.Thread(target=runner, daemon=True).start()


def _stop_running_replay(runtime: _ReplayRuntime, *, timeout_s: float = 12.0) -> bool:
    """Signal the running replay to stop and wait for its worker thread to wind
    down (close the session, return the fixture to idle, publish the final
    status). Returns True if it stopped within the timeout. Safe / idempotent
    when nothing is running. Enforces the "one replay at a time" invariant: a
    new replay always supersedes the previous one rather than racing it."""
    runtime.stop_event.set()
    runtime.pause_event.clear()  # a paused replay must be able to observe the stop
    deadline = monotonic() + timeout_s
    while monotonic() < deadline:
        if not _snapshot_progress(runtime).is_running:
            return True
        sleep(0.25)
    return not _snapshot_progress(runtime).is_running


# ---------------------------------------------------------------------------
# Streamlit UI.
# ---------------------------------------------------------------------------

st.set_page_config(page_title="fundXI Simulation", layout="centered")
st.title("fundXI — Simulation Control Panel")
st.caption("Replay recorded fixtures into the live store at controlled speed.")

runtime = _runtime()
snap = _snapshot_progress(runtime)

# Reset
st.subheader("Reset")
col_left, col_right = st.columns(2)
if col_left.button("Wipe simulation data", use_container_width=True, disabled=snap.is_running):
    _run_async(_run_wipe(WipeScope.DATA_ONLY))
    st.success("Simulation data wiped — events, comments, ticks, derived stats.")
if col_right.button("Wipe + portfolio", use_container_width=True, disabled=snap.is_running):
    _run_async(_run_wipe(WipeScope.FULL))
    st.success("Everything wiped including portfolio / holdings / trades.")
    st.info(
        "Run `uv run python -m src.infrastructure.workers.bootstrap_user` "
        "to recreate the default portfolio before trading again."
    )

st.divider()

# Replay
st.subheader("Replay")
try:
    fixtures = _run_async(_load_fixture_choices())
except Exception as exc:
    st.error(f"Could not load fixtures from DB: {exc}")
    fixtures = []

if not fixtures:
    st.warning("No fixtures with a kickoff time were found in `core.fixture`.")
else:
    labels = [f.label for f in fixtures]
    # Default to the last fixture (WC2022 final, by chronological sort).
    selected_label = st.selectbox("Fixture", labels, index=len(labels) - 1)
    selected = next(f for f in fixtures if f.label == selected_label)
    speed = st.slider(
        "Speed (game minutes per real second)",
        min_value=1,
        max_value=600,
        value=10,
        step=1,
        help=(
            "1 = real time (90 min match → 90 min wall-clock). "
            "10 = the 90+ minutes play out in ~12 min — slow enough to watch. "
            "60 = 1 game minute per real second (~2 min total). "
            "600 = ~9 seconds for the whole match."
        ),
    )
    from_minute = st.number_input("Start at minute", min_value=0, max_value=130, value=0)
    wipe_before = st.checkbox(
        "Wipe fixture before each replay",
        value=True,
        help=(
            "Clear this fixture's replayable rows (events, commentary, price ticks) and "
            "reset its clock / score before replaying, so every run starts from a clean "
            "slate. Uncheck only if you want to layer onto existing data."
        ),
    )

    start_col, wipe_col = st.columns([2, 1])
    start_label = "Restart replay" if snap.is_running else "Start replay"
    if start_col.button(start_label, type="primary", use_container_width=True):
        if snap.is_running:
            with st.spinner("Stopping the running replay…"):
                if not _stop_running_replay(runtime):
                    st.warning("Previous replay didn't stop within 12s — starting the new one anyway.")
        if wipe_before:
            try:
                _run_async(_run_wipe_fixture(selected.smk_id))
            except Exception as exc:
                st.error(f"Pre-replay wipe of fixture #{selected.smk_id} failed: {exc}")
                st.stop()
        _start_replay_in_thread(
            runtime,
            fixture_smk_id=selected.smk_id,
            fixture_label=selected.label,
            speed=float(speed),
            from_minute=int(from_minute),
        )
        st.rerun()
    if wipe_col.button(
        "Wipe this fixture",
        disabled=snap.is_running,
        use_container_width=True,
        help=(
            "One-off: clear this fixture's replayable rows and reset its clock / score, "
            "without replaying. Every other fixture is left intact; tournament-level "
            "aggregates are not recomputed."
        ),
    ):
        try:
            _run_async(_run_wipe_fixture(selected.smk_id))
            st.success(f"Wiped fixture #{selected.smk_id} — events, commentary, price ticks, clock/score reset.")
        except Exception as exc:
            st.error(f"Could not wipe fixture #{selected.smk_id}: {exc}")

st.divider()

# Status
st.subheader("Status")

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
    pause_col, stop_col = st.columns(2)
    if snap.is_paused:
        if pause_col.button("Resume", use_container_width=True):
            runtime.pause_event.clear()
            st.rerun()
    elif pause_col.button("Pause", use_container_width=True):
        runtime.pause_event.set()
        st.rerun()
    if stop_col.button("Stop", type="primary", use_container_width=True):
        runtime.stop_event.set()
        runtime.pause_event.clear()  # let a paused replay observe the stop
        st.rerun()

    if snap.is_paused:
        st.warning("Replay paused — press Resume to continue, Stop to end it.")
        sleep(1)
        st.rerun()
    else:
        st.info("Replay in progress…")
        sleep(1)
        st.rerun()
elif snap.done:
    if snap.error:
        st.error(f"Replay failed — {snap.error}")
    elif snap.aborted:
        st.warning(f"Replay stopped at minute {minute_label}.")
    else:
        st.success("Replay completed.")
elif not snap.fixture_label:
    st.caption("No replay started yet.")
