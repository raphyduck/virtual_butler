"""Add pr_number column to self_modify_jobs.

Revision ID: 0010
Revises: 0009
"""

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("self_modify_jobs", sa.Column("pr_number", sa.Integer, nullable=True))


def downgrade() -> None:
    op.drop_column("self_modify_jobs", "pr_number")
