"""app.user — email + password_hash for native auth.

Revision ID: 0020
Revises: 0019
Create Date: 2026-05-15

Adds the two columns we need for email/password auth:
- ``email`` (unique, case-insensitive lookup expected at the service
  layer — stored as-is, normalised before insert).
- ``password_hash`` (bcrypt hash, ~60 chars; sized at 100 for safety).

Both are nullable on add to keep existing rows (the bootstrap test
user) valid until they are migrated or removed. New rows from the
auth flow set both fields.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0020"
down_revision: str | Sequence[str] | None = "0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("user", sa.Column("email", sa.String(255), nullable=True), schema="app")
    op.add_column("user", sa.Column("password_hash", sa.String(100), nullable=True), schema="app")
    op.create_unique_constraint("uq_app_user_email", "user", ["email"], schema="app")


def downgrade() -> None:
    op.drop_constraint("uq_app_user_email", "user", schema="app", type_="unique")
    op.drop_column("user", "password_hash", schema="app")
    op.drop_column("user", "email", schema="app")
