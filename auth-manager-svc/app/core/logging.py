"""Logging configuration using structlog."""

import logging
import sys
from typing import Any

import structlog
from structlog.types import EventDict


def add_app_context(logger: Any, method_name: str, event_dict: EventDict) -> EventDict:
    """
    Add application context to log entries.

    This processor adds standard application metadata to every log entry.
    """
    event_dict["app"] = "auth-manager-service"
    return event_dict


def configure_logging(log_level: str = "INFO") -> None:
    """
    Configure structlog for structured logging with JSON output.

    This function sets up structlog with the following features:
    - JSON output format for production
    - Timestamp in ISO format with UTC timezone
    - Log level filtering
    - Exception formatting with stack traces
    - Request ID correlation (when available)
    - Consistent field naming
    - Context preservation across log calls

    Args:
        log_level: The logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)

    Requirements:
        - 14.1: Use structlog for structured logging
        - 14.5: Support configurable log levels
        - 14.6: LOG_LEVEL environment variable support
    """
    # Convert string log level to logging constant
    numeric_level = getattr(logging, log_level.upper(), logging.INFO)

    # Shared processors for both structlog and stdlib logging
    shared_processors = [
        # Add context from thread-local storage
        structlog.contextvars.merge_contextvars,
        # Add log level
        structlog.stdlib.add_log_level,
        # Add logger name
        structlog.stdlib.add_logger_name,
        # Add timestamp in ISO format with UTC
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        # Add application context
        add_app_context,
        # Format stack info if present
        structlog.processors.StackInfoRenderer(),
        # Format exceptions with full traceback
        structlog.processors.format_exc_info,
        # Ensure proper unicode handling
        structlog.processors.UnicodeDecoder(),
    ]

    # Configure structlog
    structlog.configure(
        processors=shared_processors
        + [
            # Prepare for stdlib logging
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        # Use stdlib logging as the backend
        logger_factory=structlog.stdlib.LoggerFactory(),
        # Cache logger instances for performance
        cache_logger_on_first_use=True,
    )

    # Configure stdlib logging to use structlog's formatter
    formatter = structlog.stdlib.ProcessorFormatter(
        # Process logs from non-structlog loggers (e.g., uvicorn, sqlalchemy)
        foreign_pre_chain=shared_processors,
        processors=[
            # Remove internal structlog metadata
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            # Render to JSON
            structlog.processors.JSONRenderer(),
        ],
    )

    # Set up the root logger
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    handler.setLevel(numeric_level)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(numeric_level)

    # Configure third-party loggers to use appropriate levels
    logging.getLogger("uvicorn").setLevel(numeric_level)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)  # Reduce noise
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)  # Reduce SQL noise


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    """
    Get a structlog logger instance.

    Args:
        name: Optional logger name. If not provided, uses the caller's module name.

    Returns:
        A bound structlog logger instance that supports structured logging

    Example:
        >>> logger = get_logger(__name__)
        >>> logger.info("user_login", user_id="123", method="oauth")
        >>> logger.error("token_refresh_failed", error="invalid_grant", user_id="456")

    Requirements:
        - 14.1: Use structlog for structured logging
        - 14.7: Include correlation IDs in logs
    """
    return structlog.get_logger(name)
