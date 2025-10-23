"""Token validation endpoint."""

from fastapi import APIRouter, status

from app.core.guards import guard_condition
from app.core.logging import get_logger
from app.core.security import BearerToken
from app.dependencies import KeycloakDep
from app.models.api import SuccessResponse
from app.models.responses import ValidationResponse

logger = get_logger(__name__)

router = APIRouter(tags=["token-validation"])


@router.get(
    "/validate-token",
    response_model=SuccessResponse[ValidationResponse],
    status_code=status.HTTP_200_OK,
    summary="Validate access token",
    description="Validates an access token by introspecting it with Keycloak.",
    responses={
        200: {
            "description": "Token is valid and active",
            "content": {"application/json": {"example": {"data": {"valid": True}}}},
        },
        401: {
            "description": "Token is not active, invalid, or missing",
            "content": {
                "application/json": {
                    "examples": {
                        "missing_header": {
                            "summary": "Missing Authorization header",
                            "value": {
                                "error": "Authorization header is required",
                                "code": "unauthorized",
                                "reason": None,
                            },
                        },
                        "not_active": {
                            "summary": "Token not active",
                            "value": {
                                "error": "Token is not active",
                                "code": "token_not_active",
                                "reason": None,
                            },
                        },
                    }
                }
            },
        },
    },
)
async def validate_token(
    token: BearerToken,
    keycloak: KeycloakDep,
) -> SuccessResponse[ValidationResponse]:
    """Validate an access token via Keycloak introspection.

    Requirements:
        - 8.1: Extract Bearer token from Authorization header
        - 8.2: Call Keycloak introspection endpoint
        - 8.3: Return 200 if active
        - 8.4: Return 401 if not active
        - 8.5: Handle missing Authorization header
    """
    logger.info("validate_token")

    introspection_result = await keycloak.introspect_token(token)

    with guard_condition(introspection_result.active, "Token is not active", "token_not_active"):
        logger.info("token_valid")

    return SuccessResponse(data=ValidationResponse(valid=True))
