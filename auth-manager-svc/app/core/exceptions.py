"""Custom exception classes."""


class AuthManagerError(Exception):
    """Base exception for Auth Manager."""

    def __init__(self, message: str, code: str = "error", details: dict = None):
        self.message = message
        self.code = code
        self.details = details or {}
        super().__init__(message)


class KeycloakError(AuthManagerError):
    """Exception for Keycloak-related errors."""

    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message, "keycloak_error", {"status_code": status_code})
        self.status_code = status_code


class InvalidStateTokenError(AuthManagerError):
    """Exception for invalid state token errors."""

    def __init__(self, message: str):
        super().__init__(message, "invalid_state_token")


class TokenNotFoundError(AuthManagerError):
    """Exception for token not found errors."""

    def __init__(self, message: str):
        super().__init__(message, "token_not_found")


class UnauthorizedError(AuthManagerError):
    """Exception for unauthorized access errors."""

    def __init__(self, message: str = "Unauthorized"):
        super().__init__(message, "unauthorized")


class TokenNotActiveError(AuthManagerError):
    """Exception for inactive token errors."""

    def __init__(self, message: str = "Token is not active"):
        super().__init__(message, "token_not_active")


class ValidationError(AuthManagerError):
    """Exception for validation errors."""

    def __init__(self, message: str, details: dict):
        super().__init__(message, "validation_error", details)


class InvalidRequestError(AuthManagerError):
    """Exception for invalid request errors."""

    def __init__(self, message: str):
        super().__init__(message, "invalid_request")
