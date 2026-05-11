"""Driving adapters (daemon entry points) for the ingest context.

The worker is the only layer allowed to wire concrete adapters
together, open the DB session pool, and start the supervisor task.
"""
