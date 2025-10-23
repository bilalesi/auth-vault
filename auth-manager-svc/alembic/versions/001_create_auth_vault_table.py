"""create_auth_vault_table

Revision ID: 001
Revises:
Create Date: 2024-10-23 16:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create auth_vault table with all necessary columns and indexes."""
    # Create enum type for token_type
    op.execute("CREATE TYPE auth_token_type AS ENUM ('offline', 'refresh')")

    # Create auth_vault table
    op.create_table(
        "auth_vault",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "token_type",
            postgresql.ENUM("offline", "refresh", name="auth_token_type"),
            nullable=False,
        ),
        sa.Column("encrypted_token", sa.Text(), nullable=True),
        sa.Column("iv", sa.Text(), nullable=True),
        sa.Column("token_hash", sa.Text(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("session_state_id", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create indexes
    op.create_index("auth_vault_user_id_token_type_idx", "auth_vault", ["user_id", "token_type"])
    op.create_index("auth_vault_session_state_idx", "auth_vault", ["session_state_id"])
    op.create_index("auth_vault_token_hash_idx", "auth_vault", ["token_hash"])


def downgrade() -> None:
    """Drop auth_vault table and enum type."""
    op.drop_index("auth_vault_token_hash_idx", table_name="auth_vault")
    op.drop_index("auth_vault_session_state_idx", table_name="auth_vault")
    op.drop_index("auth_vault_user_id_token_type_idx", table_name="auth_vault")
    op.drop_table("auth_vault")
    op.execute("DROP TYPE auth_token_type")
