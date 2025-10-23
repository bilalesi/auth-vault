"""Refresh token ID endpoint."""

from fastapi import APIRouter, status

from app.core.exceptions import InvalidRequestError, TokenNotFoundError
from app.core.logging import get_logger
from app.core.security import BearerToken
from app.db.models import TokenType
from app.dependencies import KeycloakDep, TokenVaultServiceDep
from app.models.api import SuccessResponse
from app.models.responses import RefreshTokenIdResponse

logger = get_logger(__name__)

router = APIRouter(tags=["refresh-token-id"])


@router.post(
    "/refresh-token-id",
    response_model=SuccessResponse[RefreshTokenIdResponse],
    status_code=status.HTTP_200_OK,
    summary="Generate new refresh token ID",
    description="Refreshes the user's refresh token and returns a new persistent token ID.",
    responses={
        200: {
            "description": "Successfully refreshed and stored new refresh token",
            "content": {
                "application/json": {
                    "example": {
                        "data": {
                            "persistent_token_id": "550e8400-e29b-41d4-a716-446655440000",
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
        400: {
            "description": "Bad request - no session found",
            "content": {
                "application/json": {
                    "example": {
                        "error": "No session nor was found",
                        "code": "invalid_request",
                        "reason": None,
                    }
                }
            },
        },
        404: {
            "description": "No active refresh token found",
            "content": {
                "application/json": {
                    "example": {
                        "error": "No active refresh token was found",
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
                        "error": "No refresh token was generated",
                        "code": "no_refresh_token",
                        "reason": None,
                    }
                }
            },
        },
    },
)
async def make_new_refresh_token_id(
    token: BearerToken,
    keycloak: KeycloakDep,
    token_vault: TokenVaultServiceDep,
) -> SuccessResponse[RefreshTokenIdResponse]:
    """Generate a new refresh token ID.

    This endpoint retrieves the user's existing refresh token, uses it to
    refresh the access token with Keycloak, and stores the new refresh token
    with an upsert operation (ensuring only one refresh token per user).

    Args:
        token: Bearer token from Authorization header (validated)
        keycloak: Keycloak service dependency
        token_vault: Token vault service dependency

    Returns:
        SuccessResponse containing RefreshTokenIdResponse with persistent_token_id

    Raises:
        UnauthorizedError: If bearer token is missing or invalid
        InvalidRequestError: If no session found (400)
        TokenNotFoundError: If no active refresh token found (404)
        KeycloakError: If refresh token generation fails
    """
    from uuid import UUID

    from app.core.guards import guard_not_none

    logger.info("make_new_refresh_token_id")

    # Validate Bearer token and extract user information
    token_info = await keycloak.introspect_token(token)

    # Validate required claims are present
    with guard_not_none(token_info.sub, "Token missing required claim: sub") as user_id:
        session_id = token_info.session_state

        logger.info(
            "token_introspected",
            user_id=user_id,
            session_id=session_id,
        )

        # Get user's existing refresh token by user_id
        user_uuid = UUID(user_id)
        refresh_token_data = await token_vault.get_by_user_id(
            user_id=user_uuid,
            token_type=TokenType.REFRESH,
        )

        # Handle no refresh token found
        if not refresh_token_data:
            logger.warning("no_refresh_token_found", user_id=user_id)
            raise InvalidRequestError("No session nor was found")

        entry, decrypted_token = refresh_token_data

        # Validate token has encrypted data
        if not entry.encrypted_token or not entry.iv:
            logger.error("token_missing_data", token_id=str(entry.id))
            raise TokenNotFoundError("No active refresh token was found")

        logger.info(
            "refresh_token_retrieved",
            persistent_token_id=str(entry.id),
            user_id=user_id,
        )

        # Use existing refresh token to get new tokens from Keycloak
        new_token_response = await keycloak.refresh_access_token(decrypted_token)

        logger.info(
            "access_token_refreshed",
            session_state=new_token_response.session_state,
            has_refresh_token=new_token_response.refresh_token is not None,
        )

        # Verify we received a new refresh token
        with guard_not_none(
            new_token_response.refresh_token,
            "No refresh token was generated",
            "no_refresh_token",
        ) as new_refresh_token:
            # Upsert the new refresh token (ensures only one per user)
            new_token_id = await token_vault.upsert_refresh_token(
                user_id=user_uuid,
                token=new_refresh_token,
                session_state_id=new_token_response.session_state,
                metadata={"session_id": session_id},
            )

            logger.info(
                "refresh_token_upserted",
                persistent_token_id=new_token_id,
                user_id=user_id,
                session_state_id=new_token_response.session_state,
            )

            # Return new persistent_token_id
            return SuccessResponse(
                data=RefreshTokenIdResponse(
                    persistent_token_id=new_token_id,
                )
            )
