"""Pydantic request models."""

from pydantic import UUID4, BaseModel, Field


class AccessTokenRequest(BaseModel):
    """Request model for access token endpoint."""

    persistent_token_id: UUID4 = Field(..., alias="id", description="UUID of the persistent token")


class OfflineTokenRevokeRequest(BaseModel):
    """Request model for offline token revocation."""

    id: UUID4 = Field(..., description="UUID of the token to revoke")


class StateTokenPayload(BaseModel):
    """State token payload model."""

    user_id: str
    session_state_id: str
