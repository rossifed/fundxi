"""core.player identity enrichment — photo, detailed position, DOB, birth city, nationality

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-10

Adds Sportmonks-sourced identity columns to core.player so the PlayerSheet
hero + About section can render player photos, a more precise position label,
date of birth, place of birth and nationality (with flag) without any direct
Sportmonks call from the frontend. Backfilled by re-running the bootstrap
worker, which now ingests the corresponding includes.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0010"
down_revision: str | Sequence[str] | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("player", schema="core") as batch:
        batch.add_column(sa.Column("image_path", sa.String(length=255), nullable=True))
        batch.add_column(sa.Column("detailed_position", sa.String(length=64), nullable=True))
        batch.add_column(sa.Column("date_of_birth", sa.Date(), nullable=True))
        batch.add_column(sa.Column("birth_city", sa.String(length=128), nullable=True))
        batch.add_column(sa.Column("nationality_name", sa.String(length=64), nullable=True))
        batch.add_column(sa.Column("nationality_iso", sa.String(length=8), nullable=True))
        batch.add_column(sa.Column("nationality_flag_url", sa.String(length=255), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("player", schema="core") as batch:
        batch.drop_column("nationality_flag_url")
        batch.drop_column("nationality_iso")
        batch.drop_column("nationality_name")
        batch.drop_column("birth_city")
        batch.drop_column("date_of_birth")
        batch.drop_column("detailed_position")
        batch.drop_column("image_path")
