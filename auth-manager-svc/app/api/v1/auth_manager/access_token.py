"""Access token endpoint."""

from fastapi import APIRouter, Query, status
from pydantic import UUID4

from app.core.logging import get_logger
from app.core.security import BearerToken
from app.dependencies import KeycloakDep, TokenVaultServiceDep
from app.models.api import SuccessResponse
from app.models.responses import AccessTokenResponse

logger = get_logger(__name__)

router = APIRouter(tags=["access-token"])


@router.post(
    "/access-token",
    response_model=SuccessResponse[AccessTokenResponse],
    status_code=status.HTTP_200_OK,
    summary="Get fresh access token",
    description="Retrieves a fresh access token using a stored refresh/offline token.",
    responses={
        200: {
            "description": "Successfully retrieved new access token",
            "content": {
                "application/json": {
                    "example": {
                        "data": {
                            "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
                            "expires_in": 300,
                        }
                    }
                }
            },
        },
        401: {
            "description": "Unauthorized - invalid or missing bearer token",
            "content": {
                "application/json": {
                    "example": {
                        "error": "Authorization header is required",
                        "code": "unauthorized",
                        "reason": None,
                    }
                }
            },
        },
        404: {
            "description": "Token not found in vault",
            "content": {
                "application/json": {
                    "example": {
                        "error": "Token {id} not found",
                        "code": "token_not_found",
                        "reason": None,
                    }
                }
            },
        },
        500: {
            "description": "Keycloak error or internal server error",
            "content": {
                "application/json": {
                    "example": {
                        "error": "Token refresh failed",
                        "code": "keycloak_error",
                        "reason": None,
                    }
                }
            },
        },
    },
)
async def get_access_token(
    token: BearerToken,
    keycloak: KeycloakDep,
    token_vault: TokenVaultServiceDep,
    id: UUID4 = Query(..., description="Persistent token ID (UUID)"),
) -> SuccessResponse[AccessTokenResponse]:
    """Get a fresh access token using a stored refresh/offline token.

    This endpoint retrieves a stored refresh or offline token from the vault,
    decrypts it, and uses it to request a new access token from Keycloak.

    Requirements:
        - 7.1: Validate Bearer token in Authorization header
        - 7.2: Validate persistent_token_id query parameter as UUID
        - 7.3: Retrieve stored refresh/offline token from vault
        - 7.4: Decrypt token and use it to request new access token from Keycloak
        - 7.5: Return new access token and expires_in value
        - 7.6: Handle token not found (404)
        - 7.7: Handle token refresh failures

    Args:
        token: Bearer token from Authorization header (validated)
        keycloak: Keycloak service dependency
        token_vault: Token vault service dependency
        id: Persistent token ID (UUID) from query parameter

    Returns:
        SuccessResponse containing AccessTokenResponse with new access token

    Raises:
        UnauthorizedError: If bearer token is missing or invalid
        TokenNotFoundError: If persistent_token_id not found in vault
        KeycloakError: If token refresh fails
    """
    logger.info("get_access_token", persistent_token_id=str(id))

    # Requirement 7.3: Retrieve and decrypt token from vault
    entry, decrypted_token = await token_vault.retrieve_and_decrypt(id)

    logger.info(
        "token_retrieved",
        persistent_token_id=str(id),
        token_type=entry.token_type.value,
        session_state_id=entry.session_state_id,
    )

    # Requirement 7.4: Call Keycloak to refresh access token
    token_response = await keycloak.refresh_access_token(decrypted_token)

    logger.info(
        "access_token_refreshed",
        persistent_token_id=str(id),
        expires_in=token_response.expires_in,
    )

    # Requirement 7.5: Return new access token and expires_in
    return SuccessResponse(
        data=AccessTokenResponse(
            access_token=token_response.access_token,
            expires_in=token_response.expires_in,
        )
    )
