"""Guard context managers for common validation patterns."""

from contextlib import contextmanager
from typing import Any, Iterator, Optional

from sqlalchemy.exc import NoResultFound

from app.core.exceptions import AuthManagerError, UnauthorizedError, ValidationError


@contextmanager
def guard_authorization(value: Optional[str]) -> Iterator[str]:
    """Guard that ensures authorization header is present.

    Args:
        value: The authorization header value

    Yields:
        str: The authorization header value

    Raises:
        UnauthorizedError: If authorization header is missing

    Example:
        with guard_authorization(authorization) as auth_header:
            # Use auth_header safely
            pass
    """
    if not value:
        raise UnauthorizedError("Authorization header is required")
    yield value


@contextmanager
def guard_not_none(value: Optional[Any], error_message: str) -> Iterator[Any]:
    """Guard that ensures a value is not None.

    Args:
        value: The value to check
        error_message: Error message if value is None

    Yields:
        Any: The non-None value

    Raises:
        ValidationError: If value is None

    Example:
        with guard_not_none(user_id, "User ID is required") as uid:
            # Use uid safely
            pass
    """
    if value is None:
        raise ValidationError(error_message, {"field": "value"})
    yield value


@contextmanager
def guard_result(error_message: str, error_code: str = "not_found") -> Iterator[None]:
    """Guard that raises error when database query returns no results.

    Args:
        error_message: Error message to raise
        error_code: Error code for the exception

    Yields:
        None

    Raises:
        AuthManagerError: If NoResultFound is raised

    Example:
        with guard_result("Token not found"):
            token = await repository.get_by_id(token_id)
    """
    try:
        yield
    except NoResultFound as err:
        raise AuthManagerError(error_message, error_code) from err


@contextmanager
def guard_condition(
    condition: bool, error_message: str, error_code: str = "validation_error"
) -> Iterator[None]:
    """Guard that ensures a condition is true.

    Args:
        condition: The condition to check
        error_message: Error message if condition is false
        error_code: Error code for the exception

    Yields:
        None

    Raises:
        AuthManagerError: If condition is false

    Example:
        with guard_condition(token.active, "Token is not active", "token_not_active"):
            # Proceed with active token
            pass
    """
    if not condition:
        raise AuthManagerError(error_message, error_code)
    yield
