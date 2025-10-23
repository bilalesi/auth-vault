"""Offline token consent and callback endpoints."""

from typing import Optional
from urllib.parse import urlencode
from uuid import UUID

from fastapi import APIRouter, Query, status

from app.core.exceptions import InvalidStateTokenError, KeycloakError
from app.core.logging import get_logger
from app.core.security import BearerToken
from app.db.models import TokenType
from app.dependencies import KeycloakDep, StateTokenDep, TokenVaultServiceDep
from app.models.api import SuccessResponse
from app.models.responses import OfflineConsentResponse, OfflineTokenResponse

logger = get_logger(__name__)

router = APIRouter(tags=["offline-token"])


@router.get(
    "/offline-token",
    response_model=SuccessResponse[OfflineConsentResponse],
    status_code=status.HTTP_200_OK,
    summary="Request offline token consent",
    description="Initiates the offline token consent flow by generating a Keycloak authorization URL.",
    responses={
        200: {
            "description": "Successfully generated consent URL",
            "content": {
                "application/json": {
                    "example": {
                        "data": {
                            "consent_url": "http://localhost:8080/realms/myrealm/protocol/openid-connect/auth?client_id=auth-manager&redirect_uri=http://localhost:8000/api/auth/manager/offline-token/callback&response_type=code&scope=openid+offline_access&state=eyJhbGc...",
                            "session_state_id": "abc123-session-state",
                            "state_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                            "message": "Please visit the consent URL to authorize offline access",
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
        500: {
            "description": "Keycloak error or internal server error",
            "content": {
                "application/json": {
                    "example": {
                        "error": "Token introspection failed",
                        "code": "keycloak_error",
                        "reason": None,
                    }
                }
            },
        },
    },
)
async def request_offline_token_consent(
    token: BearerToken,
    keycloak: KeycloakDep,
    state_token_service: StateTokenDep,
) -> SuccessResponse[OfflineConsentResponse]:
    """Request user consent for offline access.

    This endpoint validates the access token, extracts user information,
    generates a state token, and constructs a Keycloak authorization URL
    with offline_access scope for user consent.

    Requirements:
        - 9.1: Validate Bearer token in Authorization header
        - 9.2: Extract user_id and session_state_id from token
        - 9.3: Generate state token with user_id and session_state_id
        - 9.4: Construct Keycloak authorization URL with offline_access scope
        - 9.5: Return consent URL, session_state_id, state token, and message
        - 9.6: Handle invalid access token (401)

    Args:
        token: Bearer token from Authorization header (validated)
        keycloak: Keycloak service dependency
        state_token_service: State token service dependency

    Returns:
        SuccessResponse containing OfflineConsentResponse with consent URL

    Raises:
        UnauthorizedError: If bearer token is missing or invalid
    """
    from app.core.guards import guard_condition, guard_not_none

    logger.info("request_offline_token_consent")

    # Requirement 9.2: Extract user_id and session_state_id from token
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

                # Requirement 9.3: Generate state token with user_id and session_state_id
                state_token = state_token_service.generate_state_token(
                    user_id=user_id,
                    session_state_id=session_state_id,
                )

                logger.info("state_token_generated", session_state_id=session_state_id)

                # Requirement 9.4: Construct Keycloak authorization URL with offline_access scope
                auth_params = {
                    "client_id": keycloak.settings.client_id,
                    "redirect_uri": keycloak.settings.redirect_uri,
                    "response_type": "code",
                    "scope": "openid offline_access",
                    "state": state_token,
                }

                consent_url = f"{keycloak.settings.authorization_endpoint}?{urlencode(auth_params)}"

                logger.info("consent_url_generated", consent_url=consent_url)

                # Requirement 9.5: Return consent URL, session_state_id, state token, and message
                return SuccessResponse(
                    data=OfflineConsentResponse(
                        consent_url=consent_url,
                        session_state_id=session_state_id,
                        state_token=state_token,
                        message="Please visit the consent URL to authorize offline access",
                    )
                )


@router.get(
    "/offline-token/callback",
    response_model=SuccessResponse[OfflineTokenResponse],
    status_code=status.HTTP_200_OK,
    summary="Offline token OAuth callback",
    description="Handles the OAuth callback after user consent, exchanges authorization code for tokens, and stores the offline token.",
    responses={
        200: {
            "description": "Successfully exchanged code and stored offline token",
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
        400: {
            "description": "Bad request - missing code parameter or invalid state token",
            "content": {
                "application/json": {
                    "examples": {
                        "missing_code": {
                            "value": {
                                "error": "Missing required parameter: code",
                                "code": "invalid_request",
                                "reason": None,
                            }
                        },
                        "invalid_state": {
                            "value": {
                                "error": "Invalid state token: token expired",
                                "code": "invalid_state_token",
                                "reason": None,
                            }
                        },
                        "keycloak_error": {
                            "value": {
                                "error": "invalid_grant",
                                "code": "keycloak_error",
                                "reason": None,
                            }
                        },
                    }
                }
            },
        },
        500: {
            "description": "Internal server error",
            "content": {
                "application/json": {
                    "example": {
                        "error": "Failed to store offline token",
                        "code": "internal_error",
                        "reason": None,
                    }
                }
            },
        },
    },
)
async def offline_token_callback(
    code: str = Query(..., description="Authorization code from Keycloak"),
    state: str = Query(..., description="State token for validation"),
    error: Optional[str] = Query(None, description="Error parameter from Keycloak"),
    keycloak: KeycloakDep = None,
    state_token_service: StateTokenDep = None,
    token_vault_service: TokenVaultServiceDep = None,
) -> SuccessResponse[OfflineTokenResponse]:
    """Handle OAuth callback after user consent for offline access.

    This endpoint receives the OAuth callback from Keycloak after the user
    grants consent for offline access. It validates the state token, exchanges
    the authorization code for tokens, encrypts and stores the offline token,
    and returns the persistent token ID.

    Requirements:
        - 10.1: Validate code and state query parameters are present
        - 10.2: Parse and validate state token to extract user_id and session_state_id
        - 10.3: Exchange authorization code for tokens using Keycloak's token endpoint
        - 10.4: Encrypt and store offline token in vault with type "offline"
        - 10.5: Return persistent_token_id and session_state_id in response
        - 10.6: Handle missing code parameter (400)
        - 10.7: Handle Keycloak error parameter

    Args:
        code: Authorization code from OAuth callback (required)
        state: State token containing user_id and session_state_id (required)
        error: Error parameter if Keycloak returned an error
        keycloak: Keycloak service dependency
        state_token_service: State token service dependency
        token_vault_service: Token vault service dependency

    Returns:
        SuccessResponse containing OfflineTokenResponse with persistent_token_id

    Raises:
        InvalidStateTokenError: If state token is invalid or expired (400)
        KeycloakError: If Keycloak returns an error or code exchange fails (400/500)
    """
    from app.core.guards import guard_not_none

    logger.info("offline_token_callback", has_code=True, has_state=True)

    # Requirement 10.7: Handle Keycloak error parameter
    if error:
        logger.error("keycloak_callback_error", error=error)
        raise KeycloakError(f"Keycloak returned error: {error}", status_code=400)

    # Requirement 10.1 & 10.6: code and state are validated at route level (required parameters)
    # Requirement 10.2: Parse and validate state token
    try:
        state_payload = state_token_service.parse_state_token(state)
        logger.info(
            "state_token_parsed",
            user_id=state_payload.user_id,
            session_state_id=state_payload.session_state_id,
        )
    except InvalidStateTokenError as e:
        logger.error("invalid_state_token", error=str(e))
        raise

    # Requirement 10.3: Exchange authorization code for tokens
    try:
        token_response = await keycloak.exchange_code_for_token(
            code=code,
            redirect_uri=keycloak.settings.redirect_uri,
        )
        logger.info(
            "code_exchanged",
            session_state=token_response.session_state,
            has_refresh_token=token_response.refresh_token is not None,
        )
    except KeycloakError as e:
        logger.error("code_exchange_failed", error=str(e))
        raise

    # Verify we received a refresh token (offline token)
    with guard_not_none(
        token_response.refresh_token,
        "No refresh token received from Keycloak",
        "keycloak_error",
    ) as offline_token:
        # Requirement 10.4: Encrypt and store offline token in vault with type "offline"
        user_id = UUID(state_payload.user_id)
        stored_entry = await token_vault_service.store_token(
            user_id=user_id,
            token=offline_token,
            token_type=TokenType.OFFLINE,
            session_state_id=state_payload.session_state_id,
            metadata={
                "scope": token_response.scope,
                "token_type": token_response.token_type,
            },
        )

        logger.info(
            "offline_token_stored",
            persistent_token_id=str(stored_entry.id),
            user_id=str(user_id),
            session_state_id=state_payload.session_state_id,
        )

        # Requirement 10.5: Return persistent_token_id and session_state_id
        return SuccessResponse(
            data=OfflineTokenResponse(
                persistent_token_id=stored_entry.id,
                session_state_id=state_payload.session_state_id,
            )
        )
