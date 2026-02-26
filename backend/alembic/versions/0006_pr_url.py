"""add pr_url to self_modify_jobs for GitHub PR workflow

Revision ID: 0006
Revises: 0005
Create Date: 2026-02-26
"""

import sqlalchemy as sa

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("self_modify_jobs", sa.Column("pr_url", sa.Text, nullable=True))


def downgrade() -> None:
    op.drop_column("self_modify_jobs", "pr_url")
