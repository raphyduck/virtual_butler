"""Add conversation_id to self_modify_jobs.

Revision ID: 0011
Revises: 0010
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "self_modify_jobs",
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        op.f("ix_self_modify_jobs_conversation_id"),
        "self_modify_jobs",
        ["conversation_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_self_modify_jobs_conversation_id_conversations",
        "self_modify_jobs",
        "conversations",
        ["conversation_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_self_modify_jobs_conversation_id_conversations", "self_modify_jobs", type_="foreignkey")
    op.drop_index(op.f("ix_self_modify_jobs_conversation_id"), table_name="self_modify_jobs")
    op.drop_column("self_modify_jobs", "conversation_id")
