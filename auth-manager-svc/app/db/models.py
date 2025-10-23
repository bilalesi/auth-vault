"""SQLAlchemy ORM models."""

import enum
import uuid

from sqlalchemy import Column, DateTime, Index, Text
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from app.db.base import Base


class TokenType(str, enum.Enum):
    """Token type enumeration."""

    OFFLINE = "offline"
    REFRESH = "refresh"


class AuthVault(Base):
    """Auth vault table for storing encrypted tokens."""

    __tablename__ = "auth_vault"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    token_type = Column(SQLEnum(TokenType, name="auth_token_type"), nullable=False)
    encrypted_token = Column(Text, nullable=True)
    iv = Column(Text, nullable=True)
    token_hash = Column(Text, nullable=True)
    token_metadata = Column("metadata", JSONB, nullable=True)
    session_state_id = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    __table_args__ = (
        Index("auth_vault_user_id_token_type_idx", "user_id", "token_type"),
        Index("auth_vault_session_state_idx", "session_state_id"),
        Index("auth_vault_token_hash_idx", "token_hash"),
    )

    def __repr__(self):
        return f"<AuthVault(id={self.id}, user_id={self.user_id}, token_type={self.token_type})>"
