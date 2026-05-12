"""Infrastructure layer of the streaming bounded context.

Concrete adapters: the NATS notification source, and the SSE wire
formatter. The only layer allowed to import the NATS client.
"""
