"""Domain models."""

from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import UUID4, BaseModel

from app.db.models import TokenType


class TokenVaultEntry(BaseModel):
    """Token vault entry domain model."""

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
    """Keycloak token endpoint response model."""

    access_token: str
    refresh_token: Optional[str] = None
    expires_in: int
    refresh_expires_in: Optional[int] = None
    token_type: str
    id_token: Optional[str] = None
    scope: Optional[str] = None
    session_state: str


class TokenIntrospection(BaseModel):
    """Keycloak token introspection response model."""

    active: bool
    sub: Optional[str] = None
    session_state: Optional[str] = None
    exp: Optional[int] = None
    iat: Optional[int] = None
    client_id: Optional[str] = None
    username: Optional[str] = None
    scope: Optional[str] = None
