"""Rename abilities to skills.

Revision ID: 0007
Revises: 0006
"""

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Rename table
    op.rename_table("abilities", "skills")

    # Rename FK column in sessions
    op.alter_column("sessions", "ability_id", new_column_name="skill_id")


def downgrade() -> None:
    op.alter_column("sessions", "skill_id", new_column_name="ability_id")
    op.rename_table("skills", "abilities")
