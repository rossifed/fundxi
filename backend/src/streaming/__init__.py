"""Streaming bounded context.

The production-side push channel: subscribes to the NATS pub/sub bus
(fed by ``src/ingest`` in live, ``src/simulation`` in replay) and
fans the relevant events out to connected browsers over Server-Sent
Events.

Deliberately a separate bounded context — and a separate deployable
process — from the BFF (``src/api``):
  - the BFF is stateless request/response, scaled by QPS;
  - the streaming service holds thousands of long-lived SSE
    connections, scaled by connection count.
Both share Postgres and the NATS bus; neither imports the other.

Architecture invariants:
  - one NATS subscription per process; an in-memory ``NotifyHub``
    fans each message out to the relevant per-topic subscriber queues;
  - per-subscriber bounded queues — a slow client drops messages and
    is disconnected, never blocking the hub;
  - browsers self-heal on reconnect by re-fetching state from the BFF
    (the SSE stream carries delta hints, not the source of truth), so
    fire-and-forget NATS is sufficient;
  - the subject → topic mapping is the only place that knows the NATS
    naming scheme (``fundxi.<kind>.<id>``).
"""
