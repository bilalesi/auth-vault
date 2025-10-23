# Design Document

## Overview

This design document outlines the technical architecture for migrating the Auth Manager service from Next.js/TypeScript to FastAPI/Python. The service will maintain feature parity with the existing implementation while leveraging Python's ecosystem for improved maintainability and deployment flexibility.

### Technology Stack

- **Framework**: FastAPI 0.119.1 (async support, automatic OpenAPI generation)
- **Package Manager**: UV (fast dependency resolution and installation)
- **Python Version**: 3.12+
- **Data Validation**: Pydantic v2 (type-safe models with validation)
- **Database ORM**: SQLAlchemy 2.0.44 (async support)
- **Database**: PostgreSQL 18 (existing database, no schema changes)
- **Migration Tool**: Alembic (database schema versioning)
- **HTTP Client**: httpx (async HTTP client for Keycloak integration)
- **Encryption**: cryptography library (AES-256-CBC)
- **Logging**: structlog (structured logging)
- **Testing**: pytest with pytest-asyncio
- **ASGI Server**: uvicorn (production-ready async server)

### Design Principles

1. **Async-First**: All I/O operations (database, HTTP) use async/await
2. **Type Safety**: Comprehensive type hints and Pydantic validation
3. **Dependency Injection**: FastAPI's DI system for clean architecture
4. **Single Responsibility**: Clear separation between routes, services, and data access
5. **Error Handling**: Centralized exception handling with consistent responses
6. **Configuration**: Environment-based configuration with validation
7. **Testability**: Dependency injection enables easy mocking and testing

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     FastAPI Application                      │
├─────────────────────────────────────────────────────────────┤
│  API Layer (Routes)                                          │
│  ├── /api/auth/manager/access-token                         │
│  ├── /api/auth/manager/validate-token                       │
│  ├── /api/auth/manager/offline-token                        │
│  ├── /api/auth/manager/offline-token/callback               │
│  ├── /api/auth/manager/offline-token-id                     │
│  ├── /health                                                 │
│  └── /health/ready                                           │
├─────────────────────────────────────────────────────────────┤
│  Middleware Layer                                            │
│  ├── Request ID Middleware                                   │
│  ├── Logging Middleware                                      │
│  ├── Error Handler Middleware                                │
│  └── CORS Middleware                                         │
```

├─────────────────────────────────────────────────────────────┤
│ Service Layer (Business Logic) │
│ ├── TokenVaultService (CRUD operations) │
│ ├── KeycloakService (OAuth operations) │
│ ├── EncryptionService (AES encryption/decryption) │
│ ├── ValidationService (token validation) │
│ └── StateTokenService (state token generation/parsing) │
├─────────────────────────────────────────────────────────────┤
│ Data Access Layer │
│ ├── TokenVaultRepository (database operations) │
│ └── Database Session Management │
├─────────────────────────────────────────────────────────────┤
│ External Dependencies │
│ ├── PostgreSQL Database (Token Vault) │
│ └── Keycloak Server (OAuth/OIDC Provider) │
└─────────────────────────────────────────────────────────────┘

```

### Project Structure

```

auth-manager-svc/
├── pyproject.toml # UV/pip dependencies and project metadata
├── .env.example # Environment variable template
├── .python-version # Python version specification
├── Dockerfile # Container image definition
├── docker-compose.yml # Local development setup
├── alembic.ini # Alembic configuration
├── README.md # Service documentation
│
├── app/
│ ├── **init**.py
│ ├── main.py # FastAPI application entry point
│ ├── config.py # Configuration management (Pydantic Settings)
│ ├── dependencies.py # FastAPI dependency injection
│ │
│ ├── api/ # API routes
│ │ ├── **init**.py
│ │ ├── health.py # Health check endpoints
│ │ └── v1/
│ │ ├── **init**.py
│ │ └── auth_manager/
│ │ ├── **init**.py
│ │ ├── access_token.py
│ │ ├── validate_token.py
│ │ ├── offline_token.py
│ │ └── offline_token_id.py
│ │
│ ├── models/ # Pydantic models
│ │ ├── **init**.py
│ │ ├── requests.py # Request models
│ │ ├── responses.py # Response models
│ │ └── domain.py # Domain models
│ │
│ ├── db/ # Database layer
│ │ ├── **init**.py
│ │ ├── base.py # SQLAlchemy base and session
│ │ ├── models.py # SQLAlchemy ORM models
│ │ └── repositories/
│ │ ├── **init**.py
│ │ └── token_vault.py # Token vault repository
│ │
│ ├── services/ # Business logic
│ │ ├── **init**.py
│ │ ├── keycloak.py # Keycloak client
│ │ ├── encryption.py # Token encryption/decryption
│ │ ├── token_vault.py # Token vault service
│ │ ├── validation.py # Token validation
│ │ └── state_token.py # State token management
│ │
│ ├── core/ # Core utilities
│ │ ├── **init**.py
│ │ ├── exceptions.py # Custom exceptions
│ │ ├── logging.py # Logging configuration
│ │ └── security.py # Security utilities
│ │
│ └── middleware/ # Custom middleware
│ ├── **init**.py
│ ├── request_id.py # Request ID generation
│ └── logging.py # Request/response logging
│
├── alembic/ # Database migrations
│ ├── versions/
│ └── env.py
│
└── tests/ # Test suite
├── **init**.py
├── conftest.py # Pytest fixtures
├── unit/
│ ├── test_encryption.py
│ ├── test_keycloak.py
│ └── test_services.py
├── integration/
│ └── test_repositories.py
└── e2e/
└── test_api.py

````

## Components and Interfaces

### 1. Configuration Management

**File**: `app/config.py`

```python
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, PostgresDsn, validator

class DatabaseSettings(BaseSettings):
    url: PostgresDsn
    pool_size: int = 10
    max_overflow: int = 20
    pool_timeout: int = 30
    echo: bool = False

class KeycloakSettings(BaseSettings):
    issuer: str
    client_id: str
    client_secret: str
    token_endpoint: str
    introspection_endpoint: str
    revocation_endpoint: str
    userinfo_endpoint: str
    admin_url: str
    realm: str

class EncryptionSettings(BaseSettings):
    token_vault_encryption_key: str = Field(min_length=64, max_length=64)

class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

    app_name: str = "Auth Manager Service"
    version: str = "1.0.0"
    debug: bool = False
    log_level: str = "INFO"

    database: DatabaseSettings
    keycloak: KeycloakSettings
    encryption: EncryptionSettings
````

### 2. Database Models

**File**: `app/db/models.py`

```python
from sqlalchemy import Column, String, Text, DateTime, Index, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
import enum
import uuid

from app.db.base import Base

class TokenType(str, enum.Enum):
    OFFLINE = "offline"
    REFRESH = "refresh"

class AuthVault(Base):
    __tablename__ = "auth_vault"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    token_type = Column(SQLEnum(TokenType, name="auth_token_type"), nullable=False)
    encrypted_token = Column(Text, nullable=True)
    iv = Column(Text, nullable=True)
    token_hash = Column(Text, nullable=True)
    metadata = Column(JSONB, nullable=True)
    session_state_id = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    __table_args__ = (
        Index("auth_vault_user_id_token_type_idx", "user_id", "token_type"),
        Index("auth_vault_session_state_idx", "session_state_id"),
        Index("auth_vault_token_hash_idx", "token_hash"),
    )
```

### 3. Pydantic Models

**File**: `app/models/requests.py`

```python
from pydantic import BaseModel, UUID4, Field
from typing import Optional

class AccessTokenRequest(BaseModel):
    persistent_token_id: UUID4 = Field(..., alias="id")

class OfflineTokenRevokeRequest(BaseModel):
    id: UUID4

class StateTokenPayload(BaseModel):
    user_id: str
    session_state_id: str
```

**File**: `app/models/responses.py`

```python
from pydantic import BaseModel, UUID4
from typing import Optional, Any, Dict

class AccessTokenResponse(BaseModel):
    access_token: str
    expires_in: int

class OfflineTokenResponse(BaseModel):
    persistent_token_id: UUID4
    session_state_id: str

class OfflineConsentResponse(BaseModel):
    consent_url: str
    session_state_id: str
    state_token: str
    message: str

class ValidationResponse(BaseModel):
    valid: bool = True

class ErrorResponse(BaseModel):
    error: str
    code: str
    details: Optional[Dict[str, Any]] = None
    operation: Optional[str] = None

class SuccessResponse(BaseModel):
    data: Any
```

**File**: `app/models/domain.py`

```python
from pydantic import BaseModel, UUID4
from datetime import datetime
from typing import Optional, Dict, Any
from app.db.models import TokenType

class TokenVaultEntry(BaseModel):
    id: UUID4
    user_id: UUID4
    token_type: TokenType
    encrypted_token: Optional[str]
    iv: Optional[str]
    token_hash: Optional[str]
    metadata: Optional[Dict[str, Any]]
    session_state_id: str
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True

class KeycloakTokenResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    expires_in: int
    refresh_expires_in: Optional[int] = None
    token_type: str
    id_token: Optional[str] = None
    scope: Optional[str] = None
    session_state: str

class TokenIntrospection(BaseModel):
    active: bool
    sub: Optional[str] = None
    session_state: Optional[str] = None
    exp: Optional[int] = None
    iat: Optional[int] = None
    client_id: Optional[str] = None
    username: Optional[str] = None
```

### 4. Encryption Service

**File**: `app/services/encryption.py`

```python
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
import hashlib
import secrets
import os

class EncryptionService:
    def __init__(self, encryption_key: str):
        if len(encryption_key) != 64:
            raise ValueError("Encryption key must be 64 hex characters (32 bytes)")
        self.key = bytes.fromhex(encryption_key)

    def generate_iv(self) -> str:
        """Generate a random 16-byte IV and return as hex string"""
        return secrets.token_hex(16)

    def encrypt_token(self, token: str, iv: str) -> str:
        """Encrypt token using AES-256-CBC"""
        iv_bytes = bytes.fromhex(iv)
        cipher = Cipher(
            algorithms.AES(self.key),
            modes.CBC(iv_bytes),
            backend=default_backend()
        )
        encryptor = cipher.encryptor()

        # Pad token to multiple of 16 bytes
        padded_token = self._pad(token.encode())
        encrypted = encryptor.update(padded_token) + encryptor.finalize()
        return encrypted.hex()

    def decrypt_token(self, encrypted_token: str, iv: str) -> str:
        """Decrypt token using AES-256-CBC"""
        iv_bytes = bytes.fromhex(iv)
        encrypted_bytes = bytes.fromhex(encrypted_token)

        cipher = Cipher(
            algorithms.AES(self.key),
            modes.CBC(iv_bytes),
            backend=default_backend()
        )
        decryptor = cipher.decryptor()

        decrypted = decryptor.update(encrypted_bytes) + decryptor.finalize()
        return self._unpad(decrypted).decode()

    def hash_token(self, token: str) -> str:
        """Generate SHA-256 hash of token"""
        return hashlib.sha256(token.encode()).hexdigest()

    @staticmethod
    def _pad(data: bytes) -> bytes:
        """PKCS7 padding"""
        padding_length = 16 - (len(data) % 16)
        return data + bytes([padding_length] * padding_length)

    @staticmethod
    def _unpad(data: bytes) -> bytes:
        """Remove PKCS7 padding"""
        padding_length = data[-1]
        return data[:-padding_length]
```

### 5. Keycloak Service

**File**: `app/services/keycloak.py`

```python
import httpx
from typing import Optional, Dict, Any
from app.models.domain import KeycloakTokenResponse, TokenIntrospection
from app.core.exceptions import KeycloakError
from app.config import KeycloakSettings

class KeycloakService:
    def __init__(self, settings: KeycloakSettings):
        self.settings = settings
        self.client = httpx.AsyncClient(timeout=30.0)

    async def refresh_access_token(self, refresh_token: str) -> KeycloakTokenResponse:
        """Refresh access token using refresh token"""
        data = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": self.settings.client_id,
            "client_secret": self.settings.client_secret,
        }

        response = await self.client.post(self.settings.token_endpoint, data=data)
        if response.status_code != 200:
            raise KeycloakError(
                f"Token refresh failed: {response.text}",
                status_code=response.status_code
            )

        return KeycloakTokenResponse(**response.json())

    async def request_offline_token(self, refresh_token: str) -> KeycloakTokenResponse:
        """Request offline token with offline_access scope"""
        data = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": self.settings.client_id,
            "client_secret": self.settings.client_secret,
            "scope": "offline_access",
        }

        response = await self.client.post(self.settings.token_endpoint, data=data)
        if response.status_code != 200:
            raise KeycloakError(
                f"Offline token request failed: {response.text}",
                status_code=response.status_code
            )

        return KeycloakTokenResponse(**response.json())

    async def introspect_token(self, token: str) -> TokenIntrospection:
        """Introspect token to check if it's active"""
        data = {
            "token": token,
            "client_id": self.settings.client_id,
            "client_secret": self.settings.client_secret,
        }

        response = await self.client.post(
            self.settings.introspection_endpoint,
            data=data
        )
        if response.status_code != 200:
            raise KeycloakError(
                f"Token introspection failed: {response.text}",
                status_code=response.status_code
            )

        return TokenIntrospection(**response.json())

    async def revoke_token(self, token: str, token_type_hint: str = "refresh_token"):
        """Revoke a token"""
        data = {
            "token": token,
            "token_type_hint": token_type_hint,
            "client_id": self.settings.client_id,
            "client_secret": self.settings.client_secret,
        }

        response = await self.client.post(self.settings.revocation_endpoint, data=data)
        if response.status_code not in [200, 204]:
            raise KeycloakError(
                f"Token revocation failed: {response.text}",
                status_code=response.status_code
            )

    async def revoke_session(self, session_id: str):
        """Revoke Keycloak session using admin API"""
        # Get admin token first
        admin_token = await self._get_admin_token()

        url = f"{self.settings.admin_url}/realms/{self.settings.realm}/sessions/{session_id}"
        headers = {"Authorization": f"Bearer {admin_token}"}

        response = await self.client.delete(url, headers=headers)
        if response.status_code not in [200, 204]:
            raise KeycloakError(
                f"Session revocation failed: {response.text}",
                status_code=response.status_code
            )

    async def exchange_code_for_token(self, code: str, redirect_uri: str) -> KeycloakTokenResponse:
        """Exchange authorization code for tokens"""
        data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": self.settings.client_id,
            "client_secret": self.settings.client_secret,
        }

        response = await self.client.post(self.settings.token_endpoint, data=data)
        if response.status_code != 200:
            raise KeycloakError(
                f"Code exchange failed: {response.text}",
                status_code=response.status_code
            )

        return KeycloakTokenResponse(**response.json())

    async def _get_admin_token(self) -> str:
        """Get admin access token for admin API calls"""
        data = {
            "grant_type": "client_credentials",
            "client_id": self.settings.client_id,
            "client_secret": self.settings.client_secret,
        }

        response = await self.client.post(self.settings.token_endpoint, data=data)
        if response.status_code != 200:
            raise KeycloakError(
                f"Admin token request failed: {response.text}",
                status_code=response.status_code
            )

        return response.json()["access_token"]

    async def close(self):
        """Close HTTP client"""
        await self.client.aclose()
```

### 6. Token Vault Repository

**File**: `app/db/repositories/token_vault.py`

```python
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, and_
from typing import Optional, List
from uuid import UUID

from app.db.models import AuthVault, TokenType
from app.models.domain import TokenVaultEntry

class TokenVaultRepository:
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
        metadata: Optional[dict] = None
    ) -> TokenVaultEntry:
        """Create a new token vault entry"""
        entry = AuthVault(
            user_id=user_id,
            token_type=token_type,
            encrypted_token=encrypted_token,
            iv=iv,
            token_hash=token_hash,
            session_state_id=session_state_id,
            metadata=metadata
        )
        self.session.add(entry)
        await self.session.flush()
        await self.session.refresh(entry)
        return TokenVaultEntry.model_validate(entry)

    async def get_by_id(self, token_id: UUID) -> Optional[TokenVaultEntry]:
        """Retrieve token by persistent token ID"""
        result = await self.session.execute(
            select(AuthVault).where(AuthVault.id == token_id)
        )
        entry = result.scalar_one_or_none()
        return TokenVaultEntry.model_validate(entry) if entry else None

    async def get_by_user_id(
        self,
        user_id: UUID,
        token_type: Optional[TokenType] = None
    ) -> Optional[TokenVaultEntry]:
        """Get token by user ID and optionally token type"""
        query = select(AuthVault).where(AuthVault.user_id == user_id)
        if token_type:
            query = query.where(AuthVault.token_type == token_type)
        query = query.order_by(AuthVault.created_at.desc())

        result = await self.session.execute(query)
        entry = result.scalar_one_or_none()
        return TokenVaultEntry.model_validate(entry) if entry else None

    async def get_by_session_state_id(
        self,
        session_state_id: str,
        token_type: Optional[TokenType] = None
    ) -> Optional[TokenVaultEntry]:
        """Get token by session state ID"""
        query = select(AuthVault).where(
            AuthVault.session_state_id == session_state_id
        )
        if token_type:
            query = query.where(AuthVault.token_type == token_type)

        result = await self.session.execute(query)
        entry = result.scalar_one_or_none()
        return TokenVaultEntry.model_validate(entry) if entry else None

    async def get_all_by_session_state_id(
        self,
        session_state_id: str,
        exclude_id: Optional[UUID] = None,
        token_type: Optional[TokenType] = None
    ) -> List[TokenVaultEntry]:
        """Get all tokens with matching session state ID"""
        query = select(AuthVault).where(
            AuthVault.session_state_id == session_state_id
        )
        if exclude_id:
            query = query.where(AuthVault.id != exclude_id)
        if token_type:
            query = query.where(AuthVault.token_type == token_type)

        result = await self.session.execute(query)
        entries = result.scalars().all()
        return [TokenVaultEntry.model_validate(e) for e in entries]

    async def check_duplicate_token_hash(
        self,
        token_hash: str,
        exclude_id: UUID
    ) -> bool:
        """Check if token hash exists (excluding specific ID)"""
        result = await self.session.execute(
            select(AuthVault).where(
                and_(
                    AuthVault.token_hash == token_hash,
                    AuthVault.id != exclude_id
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
        metadata: Optional[dict] = None
    ) -> str:
        """Upsert refresh token (ensure only one per user)"""
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
                    metadata=metadata
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
                metadata=metadata
            )
            return str(entry.id)

    async def delete_by_id(self, token_id: UUID) -> bool:
        """Delete token by ID"""
        result = await self.session.execute(
            delete(AuthVault).where(AuthVault.id == token_id)
        )
        return result.rowcount > 0
```

### 7. Token Vault Service

**File**: `app/services/token_vault.py`

```python
from uuid import UUID
from typing import Optional
from app.db.repositories.token_vault import TokenVaultRepository
from app.services.encryption import EncryptionService
from app.db.models import TokenType
from app.models.domain import TokenVaultEntry
from app.core.exceptions import TokenNotFoundError

class TokenVaultService:
    def __init__(
        self,
        repository: TokenVaultRepository,
        encryption: EncryptionService
    ):
        self.repository = repository
        self.encryption = encryption

    async def store_token(
        self,
        user_id: UUID,
        token: str,
        token_type: TokenType,
        session_state_id: str,
        metadata: Optional[dict] = None
    ) -> TokenVaultEntry:
        """Encrypt and store a token"""
        iv = self.encryption.generate_iv()
        encrypted_token = self.encryption.encrypt_token(token, iv)
        token_hash = self.encryption.hash_token(token)

        return await self.repository.create(
            user_id=user_id,
            token_type=token_type,
            encrypted_token=encrypted_token,
            iv=iv,
            token_hash=token_hash,
            session_state_id=session_state_id,
            metadata=metadata
        )

    async def retrieve_and_decrypt(self, token_id: UUID) -> tuple[TokenVaultEntry, str]:
        """Retrieve and decrypt a token"""
        entry = await self.repository.get_by_id(token_id)
        if not entry:
            raise TokenNotFoundError(f"Token {token_id} not found")

        if not entry.encrypted_token or not entry.iv:
            raise TokenNotFoundError(f"Token {token_id} has no encrypted data")

        decrypted_token = self.encryption.decrypt_token(
            entry.encrypted_token,
            entry.iv
        )

        return entry, decrypted_token

    async def upsert_refresh_token(
        self,
        user_id: UUID,
        token: str,
        session_state_id: str,
        metadata: Optional[dict] = None
    ) -> str:
        """Upsert refresh token (only one per user)"""
        iv = self.encryption.generate_iv()
        encrypted_token = self.encryption.encrypt_token(token, iv)
        token_hash = self.encryption.hash_token(token)

        return await self.repository.upsert_refresh_token(
            user_id=user_id,
            encrypted_token=encrypted_token,
            iv=iv,
            token_hash=token_hash,
            session_state_id=session_state_id,
            metadata=metadata
        )

    async def get_by_session_state(
        self,
        session_state_id: str,
        token_type: Optional[TokenType] = None
    ) -> Optional[tuple[TokenVaultEntry, str]]:
        """Get and decrypt token by session state ID"""
        entry = await self.repository.get_by_session_state_id(
            session_state_id,
            token_type
        )
        if not entry or not entry.encrypted_token or not entry.iv:
            return None

        decrypted_token = self.encryption.decrypt_token(
            entry.encrypted_token,
            entry.iv
        )

        return entry, decrypted_token

    async def delete_token(self, token_id: UUID) -> bool:
        """Delete a token from vault"""
        return await self.repository.delete_by_id(token_id)

    async def check_shared_token(
        self,
        token_hash: str,
        session_state_id: str,
        exclude_id: UUID
    ) -> tuple[bool, bool]:
        """Check if token is shared by hash or session"""
        has_duplicate_hash = await self.repository.check_duplicate_token_hash(
            token_hash,
            exclude_id
        )

        shared_sessions = await self.repository.get_all_by_session_state_id(
            session_state_id,
            exclude_id=exclude_id
        )

        return has_duplicate_hash, len(shared_sessions) > 0
```

### 8. State Token Service

**File**: `app/services/state_token.py`

```python
import jwt
from datetime import datetime, timedelta
from app.models.requests import StateTokenPayload
from app.core.exceptions import InvalidStateTokenError

class StateTokenService:
    def __init__(self, secret_key: str):
        self.secret_key = secret_key

    def generate_state_token(
        self,
        user_id: str,
        session_state_id: str,
        expires_in: int = 600  # 10 minutes
    ) -> str:
        """Generate JWT state token"""
        payload = {
            "user_id": user_id,
            "session_state_id": session_state_id,
            "exp": datetime.utcnow() + timedelta(seconds=expires_in),
            "iat": datetime.utcnow()
        }

        return jwt.encode(payload, self.secret_key, algorithm="HS256")

    def parse_state_token(self, token: str) -> StateTokenPayload:
        """Parse and validate state token"""
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=["HS256"])
            return StateTokenPayload(
                user_id=payload["user_id"],
                session_state_id=payload["session_state_id"]
            )
        except jwt.ExpiredSignatureError:
            raise InvalidStateTokenError("State token has expired")
        except jwt.InvalidTokenError as e:
            raise InvalidStateTokenError(f"Invalid state token: {str(e)}")
```

## Data Models

### Database Schema

The existing PostgreSQL schema will be maintained:

```sql
-- Enums
CREATE TYPE auth_token_type AS ENUM ('offline', 'refresh');

-- Main table
CREATE TABLE auth_vault (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    token_type auth_token_type NOT NULL,
    encrypted_token TEXT,
    iv TEXT,
    token_hash TEXT,
    metadata JSONB,
    session_state_id TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX auth_vault_user_id_token_type_idx ON auth_vault(user_id, token_type);
CREATE INDEX auth_vault_session_state_idx ON auth_vault(session_state_id);
CREATE INDEX auth_vault_token_hash_idx ON auth_vault(token_hash);
```

### API Request/Response Flow

#### Access Token Request Flow

```
Client → POST /api/auth/manager/access-token?id={uuid}
       → Validate Bearer token
       → Retrieve encrypted token from vault
       → Decrypt token
       → Call Keycloak token endpoint
       → Return new access token
```

#### Offline Token Callback Flow

```
Keycloak → GET /api/auth/manager/offline-token/callback?code=...&state=...
         → Parse state token
         → Exchange code for tokens
         → Encrypt offline token
         → Store in vault
         → Return persistent_token_id
```

## Error Handling

### Custom Exceptions

**File**: `app/core/exceptions.py`

```python
class AuthManagerError(Exception):
    """Base exception for Auth Manager"""
    def __init__(self, message: str, code: str, details: dict = None):
        self.message = message
        self.code = code
        self.details = details or {}
        super().__init__(message)

class TokenNotFoundError(AuthManagerError):
    def __init__(self, message: str):
        super().__init__(message, "token_not_found")

class UnauthorizedError(AuthManagerError):
    def __init__(self, message: str = "Unauthorized"):
        super().__init__(message, "unauthorized")

class TokenNotActiveError(AuthManagerError):
    def __init__(self, message: str = "Token is not active"):
        super().__init__(message, "token_not_active")

class KeycloakError(AuthManagerError):
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message, "keycloak_error", {"status_code": status_code})

class InvalidStateTokenError(AuthManagerError):
    def __init__(self, message: str):
        super().__init__(message, "invalid_state_token")

class ValidationError(AuthManagerError):
    def __init__(self, message: str, details: dict):
        super().__init__(message, "validation_error", details)
```

### Global Exception Handler

**File**: `app/main.py` (excerpt)

```python
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from app.core.exceptions import AuthManagerError
from pydantic import ValidationError

@app.exception_handler(AuthManagerError)
async def auth_manager_error_handler(request: Request, exc: AuthManagerError):
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR

    if exc.code == "unauthorized" or exc.code == "token_not_active":
        status_code = status.HTTP_401_UNAUTHORIZED
    elif exc.code == "token_not_found":
        status_code = status.HTTP_404_NOT_FOUND
    elif exc.code == "validation_error" or exc.code == "invalid_request":
        status_code = status.HTTP_400_BAD_REQUEST

    return JSONResponse(
        status_code=status_code,
        content={
            "error": exc.message,
            "code": exc.code,
            "details": exc.details,
            "operation": str(request.url.path)
        }
    )

@app.exception_handler(ValidationError)
async def validation_error_handler(request: Request, exc: ValidationError):
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={
            "error": "Validation error",
            "code": "validation_error",
            "details": exc.errors(),
            "operation": str(request.url.path)
        }
    )
```

## Testing Strategy

### Unit Tests

- Encryption/decryption functions
- Token hashing
- State token generation/parsing
- Pydantic model validation
- Configuration validation

### Integration Tests

- Database operations (CRUD)
- Repository methods
- Service layer methods with mocked dependencies

### End-to-End Tests

- API endpoints with test database
- Mocked Keycloak responses
- Full request/response cycle
- Error scenarios

### Test Fixtures

```python
# tests/conftest.py
import pytest
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from app.db.base import Base

@pytest.fixture
async def db_session():
    engine = create_async_engine("postgresql+asyncpg://test:test@localhost/test_db")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSession(engine) as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest.fixture
def mock_keycloak():
    # Mock Keycloak responses
    pass
```

## Deployment

### Docker Configuration

**Dockerfile**:

```dockerfile
FROM python:3.12-slim as builder

WORKDIR /app

# Install UV
RUN pip install uv

# Copy dependency files
COPY pyproject.toml ./

# Install dependencies
RUN uv pip install --system -r pyproject.toml

FROM python:3.12-slim

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code
COPY ./app ./app
COPY ./alembic ./alembic
COPY alembic.ini ./

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 8000

# Run application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**docker-compose.yml**:

```yaml
version: "3.8"

services:
  auth-manager:
    build: .
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/auth_vault
      - KEYCLOAK_ISSUER=${KEYCLOAK_ISSUER}
      - KEYCLOAK_CLIENT_ID=${KEYCLOAK_CLIENT_ID}
      - KEYCLOAK_CLIENT_SECRET=${KEYCLOAK_CLIENT_SECRET}
      - AUTH_MANAGER_TOKEN_VAULT_ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - LOG_LEVEL=INFO
    depends_on:
      - db
    volumes:
      - ./app:/app/app

  db:
    image: postgres:14
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=auth_vault
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### Environment Variables

**.env.example**:

```bash
# Application
APP_NAME=Auth Manager Service
VERSION=1.0.0
DEBUG=false
LOG_LEVEL=INFO

# Database
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/auth_vault
DATABASE_POOL_SIZE=10
DATABASE_MAX_OVERFLOW=20
DATABASE_POOL_TIMEOUT=30

# Keycloak
KEYCLOAK_ISSUER=http://localhost:8080/realms/myrealm
KEYCLOAK_CLIENT_ID=auth-manager
KEYCLOAK_CLIENT_SECRET=your-client-secret
KEYCLOAK_TOKEN_ENDPOINT=http://localhost:8080/realms/myrealm/protocol/openid-connect/token
KEYCLOAK_INTROSPECTION_ENDPOINT=http://localhost:8080/realms/myrealm/protocol/openid-connect/token/introspect
KEYCLOAK_REVOCATION_ENDPOINT=http://localhost:8080/realms/myrealm/protocol/openid-connect/revoke
KEYCLOAK_USERINFO_ENDPOINT=http://localhost:8080/realms/myrealm/protocol/openid-connect/userinfo
KEYCLOAK_ADMIN_URL=http://localhost:8080/admin
KEYCLOAK_REALM=myrealm

# Encryption
AUTH_MANAGER_TOKEN_VAULT_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# State Token
STATE_TOKEN_SECRET=your-secret-key-for-state-tokens
```

## API Endpoints Summary

### Authentication Endpoints

| Method | Endpoint                                       | Description                   | Auth Required |
| ------ | ---------------------------------------------- | ----------------------------- | ------------- |
| POST   | `/api/auth/manager/access-token?id={uuid}`     | Get fresh access token        | Yes           |
| GET    | `/api/auth/manager/validate-token`             | Validate access token         | Yes           |
| GET    | `/api/auth/manager/offline-token`              | Request offline token consent | Yes           |
| GET    | `/api/auth/manager/offline-token/callback`     | OAuth callback handler        | No            |
| POST   | `/api/auth/manager/offline-token-id`           | Generate new offline token    | Yes           |
| DELETE | `/api/auth/manager/offline-token-id?id={uuid}` | Revoke offline token          | Yes           |

### Health Endpoints

| Method | Endpoint        | Description             | Auth Required |
| ------ | --------------- | ----------------------- | ------------- |
| GET    | `/health`       | Basic health check      | No            |
| GET    | `/health/ready` | Readiness check with DB | No            |

### Documentation Endpoints

| Method | Endpoint        | Description           |
| ------ | --------------- | --------------------- |
| GET    | `/docs`         | Swagger UI            |
| GET    | `/redoc`        | ReDoc documentation   |
| GET    | `/openapi.json` | OpenAPI specification |

## Migration Strategy

### Phase 1: Setup and Infrastructure

1. Initialize UV project with pyproject.toml
2. Set up project structure
3. Configure database connection
4. Implement configuration management
5. Set up logging

### Phase 2: Core Services

1. Implement encryption service
2. Implement Keycloak client
3. Implement state token service
4. Create database models and repositories
5. Implement token vault service

### Phase 3: API Endpoints

1. Implement health check endpoints
2. Implement validation endpoint
3. Implement access token endpoint
4. Implement offline token request endpoint
5. Implement offline token callback endpoint
6. Implement offline token generation endpoint
7. Implement offline token revocation endpoint

### Phase 4: Testing and Documentation

1. Write unit tests
2. Write integration tests
3. Write e2e tests
4. Generate API documentation
5. Write deployment documentation

### Phase 5: Deployment

1. Create Dockerfile
2. Create docker-compose.yml
3. Test containerized deployment
4. Performance testing
5. Production deployment

## Security Considerations

1. **Token Encryption**: All tokens encrypted with AES-256-CBC before storage
2. **Environment Variables**: Sensitive config in environment, never in code
3. **HTTPS Only**: Production deployment must use HTTPS
4. **Token Validation**: All endpoints validate bearer tokens via Keycloak introspection
5. **SQL Injection**: SQLAlchemy ORM prevents SQL injection
6. **CORS**: Configure CORS appropriately for production
7. **Rate Limiting**: Consider adding rate limiting middleware
8. **Secrets Management**: Use secrets manager in production (not .env files)

## Performance Considerations

1. **Async Operations**: All I/O operations are async for better concurrency
2. **Connection Pooling**: Database connection pool configured for load
3. **HTTP Client Reuse**: Single httpx client instance reused across requests
4. **Caching**: Consider caching Keycloak introspection results (with TTL)
5. **Database Indexes**: Proper indexes on frequently queried columns
6. **Monitoring**: Structured logging for performance monitoring

## Monitoring and Observability

1. **Structured Logging**: All logs in JSON format with context
2. **Request IDs**: Correlation IDs for request tracing
3. **Metrics**: Consider adding Prometheus metrics
4. **Health Checks**: Kubernetes-compatible health endpoints
5. **Error Tracking**: Consider Sentry integration
6. **APM**: Consider adding APM tool (DataDog, New Relic)

## Future Enhancements

1. **Caching Layer**: Redis for token introspection caching
2. **Rate Limiting**: Per-user rate limiting
3. **Audit Logging**: Detailed audit trail for token operations
4. **Token Rotation**: Automatic token rotation policies
5. **Multi-tenancy**: Support for multiple Keycloak realms
6. **GraphQL API**: Alternative GraphQL interface
7. **Webhooks**: Webhook notifications for token events
