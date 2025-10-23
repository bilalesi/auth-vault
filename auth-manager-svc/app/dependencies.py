"""FastAPI dependency injection functions.

This module provides dependency injection functions for FastAPI routes.
These dependencies handle the creation and lifecycle of service instances,
database sessions, and other shared resources.

Requirements:
    - 17.3: Use FastAPI's dependency injection for database session management
"""

from typing import Annotated, AsyncGenerator

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.base import db_manager
from app.db.repositories.token_vault import TokenVaultRepository
from app.services.encryption import EncryptionService
from app.services.keycloak import KeycloakService
from app.services.state_token import StateTokenService
from app.services.token_vault import TokenVaultService


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield a database session, to be used as a dependency."""
    async for session in db_manager.session():
        yield session


def get_encryption_service() -> EncryptionService:
    """Dependency for getting the encryption service."""
    settings = get_settings()
    return EncryptionService(settings.encryption.token_vault_encryption_key)


def get_keycloak_service() -> KeycloakService:
    """Dependency for getting the Keycloak service."""
    settings = get_settings()
    return KeycloakService(settings.keycloak)


def get_state_token_service() -> StateTokenService:
    """Dependency for getting the state token service."""
    settings = get_settings()
    return StateTokenService(secret_key=settings.state_token.secret)


def get_token_vault_repository(session: "SessionDep") -> TokenVaultRepository:
    """Dependency for getting the token vault repository."""
    return TokenVaultRepository(session)


def get_token_vault_service(
    repository: Annotated[TokenVaultRepository, Depends(get_token_vault_repository)],
    encryption: Annotated[EncryptionService, Depends(get_encryption_service)],
) -> TokenVaultService:
    """Dependency for getting the token vault service."""
    return TokenVaultService(repository, encryption)


# Annotated dependency types
SessionDep = Annotated[AsyncSession, Depends(get_db)]
EncryptionDep = Annotated[EncryptionService, Depends(get_encryption_service)]
KeycloakDep = Annotated[KeycloakService, Depends(get_keycloak_service)]
StateTokenDep = Annotated[StateTokenService, Depends(get_state_token_service)]
TokenVaultRepoDep = Annotated[TokenVaultRepository, Depends(get_token_vault_repository)]
TokenVaultServiceDep = Annotated[TokenVaultService, Depends(get_token_vault_service)]
