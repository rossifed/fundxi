"""Shared messaging adapters (NATS).

Concrete implementations of the ``NotificationPublisher`` port. The
streaming context keeps its own subscribe-side adapter
(``NatsNotificationSource``) — only the publish side is shared here.
"""
