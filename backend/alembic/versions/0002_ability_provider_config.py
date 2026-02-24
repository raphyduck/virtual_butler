"""add provider_config to abilities

Revision ID: 0002
Revises: 0001
Create Date: 2026-02-24
"""

import sqlalchemy as sa

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("abilities", sa.Column("provider_config", sa.Text, nullable=True))


def downgrade() -> None:
    op.drop_column("abilities", "provider_config")
