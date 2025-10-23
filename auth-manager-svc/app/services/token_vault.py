"""Token vault service for managing encrypted token storage."""

import time
from typing import Optional
from uuid import UUID

from app.core.exceptions import TokenNotFoundError
from app.core.logging import get_logger
from app.db.models import TokenType
from app.db.repositories.token_vault import TokenVaultRepository
from app.models.domain import TokenVaultEntry
from app.services.encryption import EncryptionService

logger = get_logger(__name__)


class TokenVaultService:
    """Service for managing encrypted token storage and retrieval."""

    def __init__(self, repository: TokenVaultRepository, encryption: EncryptionService):
        """Initialize token vault service.

        Args:
            repository: Token vault repository for database operations
            encryption: Encryption service for token encryption/decryption
        """
        self.repository = repository
        self.encryption = encryption

    async def store_token(
        self,
        user_id: UUID,
        token: str,
        token_type: TokenType,
        session_state_id: str,
        metadata: Optional[dict] = None,
    ) -> TokenVaultEntry:
        """Encrypt and store a token.

        Args:
            user_id: User identifier
            token: Token string to encrypt and store
            token_type: Type of token (offline or refresh)
            session_state_id: Keycloak session state identifier
            metadata: Optional metadata to store with token

        Returns:
            TokenVaultEntry with stored token information
        """
        start_time = time.time()
        logger.info(
            "db_operation",
            operation="store_token",
            user_id=str(user_id),
            token_type=token_type.value,
        )

        iv = self.encryption.generate_iv()
        encrypted_token = self.encryption.encrypt_token(token, iv)
        token_hash = self.encryption.hash_token(token)

        result = await self.repository.create(
            user_id=user_id,
            token_type=token_type,
            encrypted_token=encrypted_token,
            iv=iv,
            token_hash=token_hash,
            session_state_id=session_state_id,
            metadata=metadata,
        )

        duration_ms = (time.time() - start_time) * 1000
        logger.info(
            "db_operation_complete",
            operation="store_token",
            token_id=str(result.id),
            duration_ms=round(duration_ms, 2),
        )

        return result

    async def retrieve_and_decrypt(self, token_id: UUID) -> tuple[TokenVaultEntry, str]:
        """Retrieve and decrypt a token.

        Args:
            token_id: Persistent token ID (UUID)

        Returns:
            Tuple of (TokenVaultEntry, decrypted_token_string)

        Raises:
            TokenNotFoundError: If token not found or has no encrypted data
        """
        start_time = time.time()
        logger.info("db_operation", operation="retrieve_and_decrypt", token_id=str(token_id))

        entry = await self.repository.get_by_id(token_id)
        if not entry:
            logger.warning("token_not_found", token_id=str(token_id))
            raise TokenNotFoundError(f"Token {token_id} not found")

        if not entry.encrypted_token or not entry.iv:
            logger.error("token_missing_data", token_id=str(token_id))
            raise TokenNotFoundError(f"Token {token_id} has no encrypted data")

        decrypted_token = self.encryption.decrypt_token(entry.encrypted_token, entry.iv)

        duration_ms = (time.time() - start_time) * 1000
        logger.info(
            "db_operation_complete",
            operation="retrieve_and_decrypt",
            token_id=str(token_id),
            duration_ms=round(duration_ms, 2),
        )

        return entry, decrypted_token

    async def upsert_refresh_token(
        self, user_id: UUID, token: str, session_state_id: str, metadata: Optional[dict] = None
    ) -> str:
        """Upsert refresh token (only one per user).

        Args:
            user_id: User identifier
            token: Refresh token string
            session_state_id: Keycloak session state identifier
            metadata: Optional metadata to store with token

        Returns:
            Persistent token ID (UUID as string)
        """
        iv = self.encryption.generate_iv()
        encrypted_token = self.encryption.encrypt_token(token, iv)
        token_hash = self.encryption.hash_token(token)

        return await self.repository.upsert_refresh_token(
            user_id=user_id,
            encrypted_token=encrypted_token,
            iv=iv,
            token_hash=token_hash,
            session_state_id=session_state_id,
            metadata=metadata,
        )

    async def get_by_session_state(
        self, session_state_id: str, token_type: Optional[TokenType] = None
    ) -> Optional[tuple[TokenVaultEntry, str]]:
        """Get and decrypt token by session state ID.

        Args:
            session_state_id: Keycloak session state identifier
            token_type: Optional token type filter

        Returns:
            Tuple of (TokenVaultEntry, decrypted_token_string) or None if not found
        """
        entry = await self.repository.get_by_session_state_id(session_state_id, token_type)
        if not entry or not entry.encrypted_token or not entry.iv:
            return None

        decrypted_token = self.encryption.decrypt_token(entry.encrypted_token, entry.iv)

        return entry, decrypted_token

    async def get_by_user_id(
        self, user_id: UUID, token_type: Optional[TokenType] = None
    ) -> Optional[tuple[TokenVaultEntry, str]]:
        """Get and decrypt token by user ID.

        Args:
            user_id: User identifier
            token_type: Optional token type filter

        Returns:
            Tuple of (TokenVaultEntry, decrypted_token_string) or None if not found
        """
        entry = await self.repository.get_by_user_id(user_id, token_type)
        if not entry or not entry.encrypted_token or not entry.iv:
            return None

        decrypted_token = self.encryption.decrypt_token(entry.encrypted_token, entry.iv)

        return entry, decrypted_token

    async def delete_token(self, token_id: UUID) -> bool:
        """Delete a token from vault.

        Args:
            token_id: Persistent token ID (UUID)

        Returns:
            True if token was deleted, False if not found
        """
        start_time = time.time()
        logger.info("db_operation", operation="delete_token", token_id=str(token_id))

        result = await self.repository.delete_by_id(token_id)

        duration_ms = (time.time() - start_time) * 1000
        logger.info(
            "db_operation_complete",
            operation="delete_token",
            token_id=str(token_id),
            deleted=result,
            duration_ms=round(duration_ms, 2),
        )

        return result

    async def check_shared_token(
        self, token_hash: str, session_state_id: str, exclude_id: UUID
    ) -> tuple[bool, bool]:
        """Check if token is shared by hash or session.

        Args:
            token_hash: SHA-256 hash of the token
            session_state_id: Keycloak session state identifier
            exclude_id: Token ID to exclude from search

        Returns:
            Tuple of (has_duplicate_hash, has_shared_session)
        """
        has_duplicate_hash = await self.repository.check_duplicate_token_hash(
            token_hash, exclude_id
        )

        shared_sessions = await self.repository.get_all_by_session_state_id(
            session_state_id, exclude_id=exclude_id
        )

        return has_duplicate_hash, len(shared_sessions) > 0
