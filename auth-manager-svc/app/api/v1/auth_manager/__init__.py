"""Auth Manager API endpoints."""

from fastapi import APIRouter

from app.api.v1.auth_manager import (
    access_token,
    offline_token,
    offline_token_id,
    refresh_token_id,
    validate_token,
)

# Create main router for auth manager endpoints
router = APIRouter()

# Include sub-routers
router.include_router(access_token.router)
router.include_router(validate_token.router)
router.include_router(offline_token.router)
router.include_router(offline_token_id.router)
router.include_router(refresh_token_id.router)

__all__ = ["router"]
