"""FastAPI application entry point."""

from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError as PydanticValidationError
from starlette.responses import Response

from app.api import health
from app.api.v1.auth_manager import router as auth_manager_router
from app.config import get_settings
from app.core.exceptions import AuthManagerError
from app.core.logging import configure_logging, get_logger
from app.db.base import db_manager
from app.middleware import LoggingMiddleware, RequestIDMiddleware
from app.models.api import ErrorResponse

logger = get_logger(__name__)

# Global HTTP client
http_client: httpx.AsyncClient | None = None


def make_logger():
    """Initialize logging configuration."""
    settings = get_settings()
    configure_logging(settings.log_level)
    logger.info("logger_initialized", log_level=settings.log_level)


def make_database():
    """Initialize database connection."""
    settings = get_settings()
    db_manager.init(
        database_url=str(settings.database.url),
        pool_size=settings.database.pool_size,
        max_overflow=settings.database.max_overflow,
        pool_timeout=settings.database.pool_timeout,
        echo=settings.database.echo,
    )
    logger.info("database_initialized")


def make_http_client() -> httpx.AsyncClient:
    """Initialize HTTP client."""
    client = httpx.AsyncClient(timeout=30.0)
    logger.info("http_client_initialized")
    return client


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    global http_client

    settings = get_settings()

    # Startup
    make_logger()
    logger.info("startup", app=settings.app_name, version=settings.version)

    make_database()
    http_client = make_http_client()

    # Store database manager in app state
    app.state.database_session_manager = db_manager

    yield

    # Shutdown
    logger.info("shutdown_started")
    await db_manager.close()
    if http_client:
        await http_client.aclose()
    logger.info("shutdown_complete")


# Create FastAPI application with metadata and lifespan
app = FastAPI(
    title="Auth Manager Service",
    description=(
        "Keycloak token management microservice for secure storage and retrieval "
        "of OAuth tokens including refresh tokens, offline tokens, and access token generation."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    contact={
        "name": "Auth Manager Service",
    },
    license_info={
        "name": "MIT",
    },
)


# Middleware to attach database manager to request state
@app.middleware("http")
async def attach_db_manager(request: Request, call_next):
    """Attach database manager to request state."""
    request.state.database_session_manager = db_manager
    response = await call_next(request)
    return response


# Register custom middleware (order matters: first added = outermost layer)
# RequestIDMiddleware should be first to generate ID for logging
app.add_middleware(RequestIDMiddleware)
app.add_middleware(LoggingMiddleware)


# Configure CORS middleware
# Note: CORS settings are loaded lazily when the application starts
def configure_cors():
    """Configure CORS middleware with settings from environment."""
    settings = get_settings()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors.origins,
        allow_credentials=settings.cors.allow_credentials,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )


# Configure CORS on startup
try:
    configure_cors()
except Exception:
    # CORS configuration will be attempted during lifespan startup
    # This allows the module to be imported without environment variables
    pass

# Error code to HTTP status code mapping
ERROR_STATUS_MAP = {
    "unauthorized": status.HTTP_401_UNAUTHORIZED,
    "token_not_active": status.HTTP_401_UNAUTHORIZED,
    "token_not_found": status.HTTP_404_NOT_FOUND,
    "validation_error": status.HTTP_400_BAD_REQUEST,
    "invalid_request": status.HTTP_400_BAD_REQUEST,
    "invalid_state_token": status.HTTP_400_BAD_REQUEST,
}


@app.exception_handler(AuthManagerError)
async def auth_manager_error_handler(request: Request, exc: AuthManagerError) -> Response:
    """Handle custom AuthManagerError exceptions."""
    if exc.code == "keycloak_error":
        status_code = exc.details.get("status_code", status.HTTP_500_INTERNAL_SERVER_ERROR)
    else:
        status_code = ERROR_STATUS_MAP.get(exc.code, status.HTTP_500_INTERNAL_SERVER_ERROR)

    logger.error(exc.code, error=exc.message, path=str(request.url.path))

    error_response = ErrorResponse(
        error=exc.message, code=exc.code, reason=exc.details.get("reason")
    )

    return Response(
        content=error_response.model_dump_json(),
        status_code=status_code,
        media_type="application/json",
    )


@app.exception_handler(RequestValidationError)
async def request_validation_error_handler(
    request: Request, exc: RequestValidationError
) -> Response:
    """Handle FastAPI request validation errors."""
    logger.error("validation_error", path=str(request.url.path), errors=exc.errors())

    error_response = ErrorResponse(
        error="Validation error",
        code="validation_error",
        reason=str(exc.errors()),
    )

    return Response(
        content=error_response.model_dump_json(),
        status_code=status.HTTP_400_BAD_REQUEST,
        media_type="application/json",
    )


@app.exception_handler(PydanticValidationError)
async def pydantic_validation_error_handler(
    request: Request, exc: PydanticValidationError
) -> Response:
    """Handle Pydantic validation errors."""
    logger.error("validation_error", path=str(request.url.path), errors=exc.errors())

    error_response = ErrorResponse(
        error="Validation error",
        code="validation_error",
        reason=str(exc.errors()),
    )

    return Response(
        content=error_response.model_dump_json(),
        status_code=status.HTTP_400_BAD_REQUEST,
        media_type="application/json",
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception) -> Response:
    """Handle all other unhandled exceptions."""
    logger.exception(
        "unhandled_exception", error_type=type(exc).__name__, path=str(request.url.path)
    )

    error_response = ErrorResponse(
        error="Internal server error",
        code="internal_error",
        reason=str(exc),
    )

    return Response(
        content=error_response.model_dump_json(),
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        media_type="application/json",
    )


# Register API routes
app.include_router(health.router)

# Register auth manager API routes
app.include_router(auth_manager_router, prefix="/api/auth/manager", tags=["auth-manager"])


@app.get("/", tags=["root"])
async def root():
    """
    Root endpoint providing basic service information.

    Returns:
        dict: Service name and version information
    """
    settings = get_settings()
    return {
        "message": settings.app_name,
        "version": settings.version,
        "status": "running",
    }
