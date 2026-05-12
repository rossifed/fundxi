"""Application layer of the streaming bounded context.

Holds the ``NotifyHub`` — the in-memory fan-out registry that turns a
single NATS subscription into per-topic SSE delivery.
"""
