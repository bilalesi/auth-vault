"""Offline token generation and revocation endpoints."""

from fastapi import APIRouter, status

from app.core.exceptions import TokenNotFoundError
from app.core.logging import get_logger
from app.core.security import BearerToken
from app.db.models import TokenType
from app.dependencies import KeycloakDep, TokenVaultServiceDep
from app.models.api import SuccessResponse
from app.models.responses import OfflineTokenResponse

logger = get_logger(__name__)

router = APIRouter(tags=["offline-token-id"])


@router.post(
    "/offline-token-id",
    response_model=SuccessResponse[OfflineTokenResponse],
    status_code=status.HTTP_200_OK,
    summary="Generate new offline token",
    description="Generates a new offline token from an existing offline token without requiring user consent.",
    responses={
        200: {
            "description": "Successfully generated and stored new offline token",
            "content": {
                "application/json": {
                    "example": {
                        "data": {
                            "persistent_token_id": "550e8400-e29b-41d4-a716-446655440000",
                            "session_state_id": "abc123-session-state",
                        }
                    }
                }
            },
        },
        401: {
            "description": "Unauthorized - invalid or missing bearer token, or token not active",
            "content": {
                "application/json": {
                    "example": {
                        "error": "Access token is not active",
                        "code": "token_not_active",
                        "reason": None,
                    }
                }
            },
        },
        404: {
            "description": "No offline token found for the session",
            "content": {
                "application/json": {
                    "example": {
                        "error": "No offline token was found to generate a new one",
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
                        "error": "Could not generate new token",
                        "code": "keycloak_error",
                        "reason": None,
                    }
                }
            },
        },
    },
)
async def generate_offline_token(
    token: BearerToken,
    keycloak: KeycloakDep,
    token_vault: TokenVaultServiceDep,
) -> SuccessResponse[OfflineTokenResponse]:
    """Generate a new offline token from an existing offline token.

    This endpoint allows generating additional offline tokens without requiring
    user consent again. It retrieves an existing offline token from the vault
    by session_state_id, uses it to request a new offline token from Keycloak,
    encrypts and stores the new offline token, and returns the persistent token ID.

    Args:
        token: Bearer token from Authorization header (validated)
        keycloak: Keycloak service dependency
        token_vault: Token vault service dependency

    Returns:
        SuccessResponse containing OfflineTokenResponse with new persistent_token_id

    Raises:
        UnauthorizedError: If bearer token is missing or invalid
        TokenNotFoundError: If no offline token found for the session (404)
        KeycloakError: If offline token request fails
    """
    from uuid import UUID

    from app.core.guards import guard_condition, guard_not_none

    logger.info("generate_offline_token")

    # Validate Bearer token and extract session information
    token_info = await keycloak.introspect_token(token)

    # Validate token is active
    with guard_condition(token_info.active, "Access token is not active", "token_not_active"):
        # Validate required claims are present
        with guard_not_none(token_info.sub, "Token missing required claim: sub") as user_id:
            with guard_not_none(
                token_info.session_state, "Token missing required claim: session_state"
            ) as session_state_id:
                logger.info(
                    "token_introspected",
                    user_id=user_id,
                    session_state_id=session_state_id,
                )

                # Retrieve existing offline token from vault by session_state_id
                offline_token_data = await token_vault.get_by_session_state(
                    session_state_id=session_state_id,
                    token_type=TokenType.OFFLINE,
                )

                # Handle no offline token found (404)
                if not offline_token_data:
                    logger.warning(
                        "no_offline_token_found",
                        session_state_id=session_state_id,
                    )
                    raise TokenNotFoundError("No offline token was found to generate a new one")

                entry, decrypted_token = offline_token_data

                logger.info(
                    "offline_token_retrieved",
                    persistent_token_id=str(entry.id),
                    session_state_id=session_state_id,
                )

                # Use existing offline token to request new offline token from Keycloak
                new_token_response = await keycloak.request_offline_token(decrypted_token)

                logger.info(
                    "new_offline_token_requested",
                    session_state=new_token_response.session_state,
                    has_refresh_token=new_token_response.refresh_token is not None,
                )

                # Verify we received a refresh token (offline token)
                with guard_not_none(
                    new_token_response.refresh_token,
                    "Could not generate new token",
                    "keycloak_error",
                ) as new_offline_token:
                    # Encrypt and store new offline token in vault
                    new_entry = await token_vault.store_token(
                        user_id=UUID(user_id),
                        token=new_offline_token,
                        token_type=TokenType.OFFLINE,
                        session_state_id=new_token_response.session_state,
                        metadata={
                            "scope": new_token_response.scope,
                            "token_type": new_token_response.token_type,
                            "from": str(entry.id),
                        },
                    )

                    logger.info(
                        "new_offline_token_stored",
                        persistent_token_id=str(new_entry.id),
                        user_id=user_id,
                        session_state_id=new_entry.session_state_id,
                    )

                    # Return new persistent_token_id and session_state_id
                    return SuccessResponse(
                        data=OfflineTokenResponse(
                            persistent_token_id=new_entry.id,
                            session_state_id=new_entry.session_state_id,
                        )
                    )
