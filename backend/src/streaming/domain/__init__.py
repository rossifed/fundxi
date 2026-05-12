"""Domain layer of the streaming bounded context.

Pure: no asyncio loop, no NATS, no HTTP. Value Objects, the
subject → topic mapping rule, and the ports the application layer
depends on.
"""
