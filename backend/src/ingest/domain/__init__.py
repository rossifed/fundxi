"""Domain layer of the ingest bounded context.

Pure: no asyncio loop, no HTTP, no DB. Holds Value Objects, Ports
(Protocols) and pure functions that the application layer depends on.
"""
