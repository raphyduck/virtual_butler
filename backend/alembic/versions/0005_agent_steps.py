"""add steps_json to self_modify_jobs for agent step log

Revision ID: 0005
Revises: 0004
Create Date: 2026-02-26
"""

import sqlalchemy as sa

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("self_modify_jobs", sa.Column("steps_json", sa.Text, nullable=True))


def downgrade() -> None:
    op.drop_column("self_modify_jobs", "steps_json")
