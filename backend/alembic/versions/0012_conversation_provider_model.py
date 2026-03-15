"""Add provider/model columns to conversations.

Revision ID: 0012
Revises: 0011
Create Date: 2026-03-15
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0012"
down_revision: str | Sequence[str] | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("conversations", sa.Column("provider", sa.String(length=50), nullable=True))
    op.add_column("conversations", sa.Column("model", sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column("conversations", "model")
    op.drop_column("conversations", "provider")
