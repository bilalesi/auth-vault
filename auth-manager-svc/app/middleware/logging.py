"""Logging middleware for request/response tracking."""

import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.logging import get_logger

logger = get_logger(__name__)


class LoggingMiddleware(BaseHTTPMiddleware):
    """Middleware to log incoming requests and outgoing responses with structured logging.

    Requirements:
        - 14.2: Log all incoming requests with method, path, and request_id
        - 14.3: Log all responses with status code and duration
    """

    async def dispatch(self, request: Request, call_next):
        """
        Log request details and response status with timing information.

        Logs include:
        - Request method and path
        - Request ID (automatically included via context from RequestIDMiddleware)
        - Client host
        - Query parameters
        - Response status code
        - Request duration in milliseconds

        All logs are structured using structlog for easy parsing and analysis.
        """
        # Record start time
        start_time = time.time()

        # Log incoming request (request_id is automatically included from context)
        logger.info(
            "incoming_request",
            method=request.method,
            path=str(request.url.path),
            client_host=request.client.host if request.client else None,
            query_params=str(request.url.query) if request.url.query else None,
        )

        # Process the request
        response: Response = await call_next(request)

        # Calculate duration
        duration_ms = (time.time() - start_time) * 1000

        # Log response (request_id is automatically included from context)
        logger.info(
            "request_completed",
            method=request.method,
            path=str(request.url.path),
            status_code=response.status_code,
            duration_ms=round(duration_ms, 2),
        )

        return response
