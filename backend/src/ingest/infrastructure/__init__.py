"""Infrastructure layer of the ingest bounded context.

Concrete adapters implementing the ports declared in
``ingest/domain/ports.py``: system clock, Sportmonks HTTP poll
loops, RSS readers, and the mock pollers used during étape A to
validate the supervisor's orchestration without touching Sportmonks.
"""
