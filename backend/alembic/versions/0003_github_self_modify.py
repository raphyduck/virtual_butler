"""add github auth fields to users and self_modify_jobs table

Revision ID: 0003
Revises: 0002
Create Date: 2026-02-24
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── users: GitHub OAuth columns ──────────────────────────────────────────
    op.add_column("users", sa.Column("github_login", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("github_access_token", sa.String(512), nullable=True))
    op.add_column("users", sa.Column("github_is_repo_owner", sa.Boolean(), nullable=False, server_default="false"))

    # ── self_modify_jobs ──────────────────────────────────────────────────────
    op.create_table(
        "self_modify_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(30), nullable=False, server_default="pending"),
        sa.Column("mode", sa.String(10), nullable=False),
        sa.Column("instruction", sa.Text, nullable=False),
        sa.Column("provider", sa.String(50), nullable=False, server_default="anthropic"),
        sa.Column("model", sa.String(100), nullable=False, server_default="claude-sonnet-4-6"),
        sa.Column("plan_json", sa.Text, nullable=True),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("commit_sha", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_self_modify_jobs_user_id", "self_modify_jobs", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_self_modify_jobs_user_id", table_name="self_modify_jobs")
    op.drop_table("self_modify_jobs")
    op.drop_column("users", "github_is_repo_owner")
    op.drop_column("users", "github_access_token")
    op.drop_column("users", "github_login")
