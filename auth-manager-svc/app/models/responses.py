"""Pydantic response models."""

from typing import Any, Dict, Optional

from pydantic import UUID4, BaseModel, Field


class AccessTokenResponse(BaseModel):
    """Response model for access token endpoint."""

    access_token: str = Field(..., description="The new access token")
    expires_in: int = Field(..., description="Token expiration time in seconds")


class OfflineTokenResponse(BaseModel):
    """Response model for offline token endpoints."""

    persistent_token_id: UUID4 = Field(..., description="UUID identifier for the stored token")
    session_state_id: str = Field(..., description="Keycloak session state identifier")


class RefreshTokenIdResponse(BaseModel):
    """Response model for refresh token ID endpoint."""

    persistent_token_id: str = Field(
        ..., description="UUID identifier for the stored refresh token"
    )


class OfflineConsentResponse(BaseModel):
    """Response model for offline token consent request."""

    consent_url: str = Field(..., description="URL to redirect user for consent")
    session_state_id: str = Field(..., description="Keycloak session state identifier")
    state_token: str = Field(..., description="State token for OAuth callback")
    message: str = Field(..., description="Informational message for the user")


class ValidationResponse(BaseModel):
    """Response model for token validation endpoint."""

    valid: bool = Field(default=True, description="Whether the token is valid and active")


class ErrorResponse(BaseModel):
    """Standard error response model."""

    error: str = Field(..., description="Human-readable error message")
    code: str = Field(..., description="Machine-readable error code")
    details: Optional[Dict[str, Any]] = Field(default=None, description="Additional error details")
    operation: Optional[str] = Field(default=None, description="The operation that failed")


class SuccessResponse(BaseModel):
    """Generic success response wrapper."""

    data: Any = Field(..., description="Response data")
