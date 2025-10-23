"""Token vault repository for database operations."""

import time
from typing import List, Optional
from uuid import UUID

from sqlalchemy import and_, delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.db.models import AuthVault, TokenType
from app.models.domain import TokenVaultEntry

logger = get_logger(__name__)


class TokenVaultRepository:
    """Repository for token vault database operations."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        user_id: UUID,
        token_type: TokenType,
        encrypted_token: str,
        iv: str,
        token_hash: str,
        session_state_id: str,
        metadata: Optional[dict] = None,
    ) -> TokenVaultEntry:
        """Create a new token vault entry."""
        start_time = time.time()
        logger.debug(
            "db_query",
            operation="create",
            user_id=str(user_id),
            token_type=token_type.value,
        )

        entry = AuthVault(
            user_id=user_id,
            token_type=token_type,
            encrypted_token=encrypted_token,
            iv=iv,
            token_hash=token_hash,
            session_state_id=session_state_id,
            metadata=metadata,
        )
        self.session.add(entry)
        await self.session.flush()
        await self.session.refresh(entry)

        duration_ms = (time.time() - start_time) * 1000
        logger.debug(
            "db_query_complete",
            operation="create",
            token_id=str(entry.id),
            duration_ms=round(duration_ms, 2),
        )

        return TokenVaultEntry.model_validate(entry)

    async def get_by_id(self, token_id: UUID) -> Optional[TokenVaultEntry]:
        """Retrieve token by persistent token ID."""
        start_time = time.time()
        logger.debug("db_query", operation="get_by_id", token_id=str(token_id))

        result = await self.session.execute(select(AuthVault).where(AuthVault.id == token_id))
        entry = result.scalar_one_or_none()

        duration_ms = (time.time() - start_time) * 1000
        logger.debug(
            "db_query_complete",
            operation="get_by_id",
            token_id=str(token_id),
            found=entry is not None,
            duration_ms=round(duration_ms, 2),
        )

        return TokenVaultEntry.model_validate(entry) if entry else None

    async def get_by_user_id(
        self, user_id: UUID, token_type: Optional[TokenType] = None
    ) -> Optional[TokenVaultEntry]:
        """Get token by user ID and optionally token type."""
        query = select(AuthVault).where(AuthVault.user_id == user_id)
        if token_type:
            query = query.where(AuthVault.token_type == token_type)
        query = query.order_by(AuthVault.created_at.desc())

        result = await self.session.execute(query)
        entry = result.scalar_one_or_none()
        return TokenVaultEntry.model_validate(entry) if entry else None

    async def get_by_session_state_id(
        self, session_state_id: str, token_type: Optional[TokenType] = None
    ) -> Optional[TokenVaultEntry]:
        """Get token by session state ID."""
        query = select(AuthVault).where(AuthVault.session_state_id == session_state_id)
        if token_type:
            query = query.where(AuthVault.token_type == token_type)

        result = await self.session.execute(query)
        entry = result.scalar_one_or_none()
        return TokenVaultEntry.model_validate(entry) if entry else None

    async def get_all_by_session_state_id(
        self,
        session_state_id: str,
        exclude_id: Optional[UUID] = None,
        token_type: Optional[TokenType] = None,
    ) -> List[TokenVaultEntry]:
        """Get all tokens with matching session state ID."""
        query = select(AuthVault).where(AuthVault.session_state_id == session_state_id)
        if exclude_id:
            query = query.where(AuthVault.id != exclude_id)
        if token_type:
            query = query.where(AuthVault.token_type == token_type)

        result = await self.session.execute(query)
        entries = result.scalars().all()
        return [TokenVaultEntry.model_validate(e) for e in entries]

    async def check_duplicate_token_hash(self, token_hash: str, exclude_id: UUID) -> bool:
        """Check if token hash exists (excluding specific ID)."""
        result = await self.session.execute(
            select(AuthVault).where(
                and_(
                    AuthVault.token_hash == token_hash,
                    AuthVault.id != exclude_id,
                )
            )
        )
        return result.scalar_one_or_none() is not None

    async def upsert_refresh_token(
        self,
        user_id: UUID,
        encrypted_token: str,
        iv: str,
        token_hash: str,
        session_state_id: str,
        metadata: Optional[dict] = None,
    ) -> str:
        """Upsert refresh token (ensure only one per user)."""
        # Check if refresh token exists for user
        existing = await self.get_by_user_id(user_id, TokenType.REFRESH)

        if existing:
            # Update existing
            await self.session.execute(
                update(AuthVault)
                .where(AuthVault.id == existing.id)
                .values(
                    encrypted_token=encrypted_token,
                    iv=iv,
                    token_hash=token_hash,
                    session_state_id=session_state_id,
                    metadata=metadata,
                )
            )
            return str(existing.id)
        else:
            # Create new
            entry = await self.create(
                user_id=user_id,
                token_type=TokenType.REFRESH,
                encrypted_token=encrypted_token,
                iv=iv,
                token_hash=token_hash,
                session_state_id=session_state_id,
                metadata=metadata,
            )
            return str(entry.id)

    async def delete_by_id(self, token_id: UUID) -> bool:
        """Delete token by ID."""
        start_time = time.time()
        logger.debug("db_query", operation="delete_by_id", token_id=str(token_id))

        result = await self.session.execute(delete(AuthVault).where(AuthVault.id == token_id))
        deleted = result.rowcount > 0

        duration_ms = (time.time() - start_time) * 1000
        logger.debug(
            "db_query_complete",
            operation="delete_by_id",
            token_id=str(token_id),
            deleted=deleted,
            duration_ms=round(duration_ms, 2),
        )

        return deleted
