"""Real ``PollerFactory`` implementation backed by Sportmonks.

DDD role: Adapter (driven). Holds the dependencies shared across all
per-fixture pollers (HTTP client, NATS publisher, async session
factory, identity maps) and assembles a ``SportmonksInplayPoller``
on demand.

The supervisor's contract is sync — ``create_inplay(internal_id)`` —
so this factory pre-loads the ``fixture_smk_by_internal`` map at
construction time. New fixtures appearing during the tournament (the
knockout bracket) are picked up at the next reference-refresh tick
(étape E), which will hand the supervisor a fresh factory.
"""

from collections.abc import Callable
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.sportmonks.client import SportmonksClient
from src.ingest.domain.ports import NotificationPublisher, Poller
from src.ingest.domain.settings import IngestionSettings
from src.ingest.infrastructure.sportmonks_id_maps import SportmonksIdMaps
from src.ingest.infrastructure.sportmonks_inplay_poller import SportmonksInplayPoller


@dataclass(slots=True)
class SportmonksPollerFactory:
    settings: IngestionSettings
    client: SportmonksClient
    publisher: NotificationPublisher
    session_factory: Callable[[], AsyncSession]
    id_maps: SportmonksIdMaps

    def set_id_maps(self, id_maps: SportmonksIdMaps) -> None:
        """Swap the snapshot in. Called by the ReferenceRefresher after a
        daily re-bootstrap so newly-created (knockout) fixtures become
        spawnable without restarting the daemon."""
        self.id_maps = id_maps

    def create_inplay(self, fixture_internal_id: int) -> Poller:
        smk_id = self.id_maps.fixture_smk_for(fixture_internal_id)
        if smk_id is None:
            raise LookupError(
                f"fixture internal_id={fixture_internal_id} has no sportmonks_id in the id maps "
                "— refresh the maps before spawning a poller for it"
            )
        return SportmonksInplayPoller(
            fixture_internal_id=fixture_internal_id,
            fixture_sportmonks_id=smk_id,
            poll_seconds=self.settings.inplay_poll_seconds,
            client=self.client,
            publisher=self.publisher,
            session_factory=self.session_factory,
            id_maps=self.id_maps,
        )
