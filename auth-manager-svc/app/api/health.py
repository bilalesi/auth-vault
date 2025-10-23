"""Health check endpoints."""

from fastapi import APIRouter, status
from pydantic import BaseModel
from sqlalchemy import text
from starlette.responses import Response

from app.config import get_settings
from app.core.logging import get_logger
from app.dependencies import SessionDep
from app.models.api import SuccessResponse

logger = get_logger(__name__)

router = APIRouter(tags=["health"])


class HealthStatus(BaseModel):
    """Health status response model."""

    status: str
    version: str
    service: str


class ReadinessStatus(BaseModel):
    """Readiness status response model."""

    status: str
    version: str
    service: str
    database: str


@router.get("/health", status_code=status.HTTP_200_OK)
async def health_check() -> SuccessResponse[HealthStatus]:
    """Basic health check endpoint.

    Requirements:
        - 15.1: Return 200 OK response with status "healthy"
        - 15.5: Include version information
    """
    settings = get_settings()
    logger.debug("health_check")

    return SuccessResponse(
        data=HealthStatus(
            status="healthy",
            version=settings.version,
            service=settings.app_name,
        )
    )


@router.get("/health/ready")
async def readiness_check(db: SessionDep) -> Response:
    """Readiness check endpoint with database connectivity verification.

    Requirements:
        - 15.2: Check database connectivity
        - 15.3: Return 200 if ready, 503 if not ready
        - 15.4: Handle database connection errors gracefully
        - 15.5: Include version information
    """
    settings = get_settings()
    logger.debug("readiness_check")

    try:
        result = await db.execute(text("SELECT 1"))
        result.scalar_one()

        logger.info("readiness_check_passed")

        response_data = SuccessResponse(
            data=ReadinessStatus(
                status="ready",
                version=settings.version,
                service=settings.app_name,
                database="connected",
            )
        )

        return Response(
            content=response_data.model_dump_json(),
            status_code=status.HTTP_200_OK,
            media_type="application/json",
        )

    except Exception as e:
        logger.error("readiness_check_failed", error=str(e))

        response_data = SuccessResponse(
            data=ReadinessStatus(
                status="not_ready",
                version=settings.version,
                service=settings.app_name,
                database="disconnected",
            )
        )

        return Response(
            content=response_data.model_dump_json(),
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            media_type="application/json",
        )
