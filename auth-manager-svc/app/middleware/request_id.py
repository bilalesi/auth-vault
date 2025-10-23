"""Request ID middleware for tracking requests."""

import uuid

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Middleware to generate and attach unique request IDs to each request."""

    async def dispatch(self, request: Request, call_next):
        """
        Generate a unique request ID for each incoming request.

        The request ID is:
        - Generated as a UUID4
        - Stored in request.state for access in route handlers
        - Bound to structlog context for automatic inclusion in all logs
        - Added to response headers as X-Request-ID

        Requirements:
            - 14.7: Include correlation IDs in logs for request tracing
        """
        # Generate unique request ID
        request_id = str(uuid.uuid4())

        # Store in request state for access in handlers and other middleware
        request.state.request_id = request_id

        # Bind request_id to structlog context so it appears in all logs
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)

        try:
            # Process the request
            response: Response = await call_next(request)

            # Add request ID to response headers
            response.headers["X-Request-ID"] = request_id

            return response
        finally:
            # Clear context after request completes
            structlog.contextvars.clear_contextvars()
