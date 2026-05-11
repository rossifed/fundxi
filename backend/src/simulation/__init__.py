"""Simulation bounded context.

This package replays recorded provider data into the live store at a
controlled cadence, so the rest of the app behaves exactly as if it
were connected to a live data feed.

It is intentionally decoupled from ``src.api``, ``src.application``
and ``src.ui``: those modules know nothing about the simulator. The
only shared surface is ``src.infrastructure.sportmonks.projectors``
(pure projection functions reused as-is so the replay path exercises
the very same code that the live ingest worker will).
"""
