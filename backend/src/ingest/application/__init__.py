"""Application layer of the ingest bounded context.

Orchestrates the supervisor loop and the per-data-type pollers over
domain ports. No HTTP, no SQL, no asyncio policy beyond what the
ports expose — concrete loops, sleeps, sessions live in
``infrastructure/`` and the worker entry point.
"""
