"""Security utilities and dependencies."""

from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.exceptions import UnauthorizedError

# HTTPBearer security scheme for extracting Bearer tokens
bearer_scheme = HTTPBearer(auto_error=False)


async def get_bearer_token(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> str:
    """Extract and validate Bearer token from Authorization header.

    Args:
        credentials: HTTP authorization credentials from FastAPI

    Returns:
        str: The extracted bearer token

    Raises:
        UnauthorizedError: If credentials are missing or invalid

    Example:
        @router.get("/protected")
        async def protected_endpoint(token: BearerToken):
            # Use token safely
            pass
    """
    if not credentials:
        raise UnauthorizedError("Authorization header is required")

    if credentials.scheme.lower() != "bearer":
        raise UnauthorizedError("Invalid authentication scheme. Expected: Bearer")

    return credentials.credentials


# Type alias for bearer token dependency
BearerToken = Annotated[str, Depends(get_bearer_token)]
