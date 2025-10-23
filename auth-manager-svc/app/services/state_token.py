"""State token generation and parsing service."""

from datetime import datetime, timedelta, timezone

import jwt

from app.core.exceptions import InvalidStateTokenError
from app.models.requests import StateTokenPayload


class StateTokenService:
    """Service for generating and parsing JWT state tokens."""

    def __init__(self, secret_key: str):
        """Initialize state token service.

        Args:
            secret_key: Secret key for signing JWT tokens
        """
        self.secret_key = secret_key

    def generate_state_token(
        self,
        user_id: str,
        session_state_id: str,
        expires_in: int = 600,  # 10 minutes default
    ) -> str:
        """Generate JWT state token.

        Args:
            user_id: User identifier
            session_state_id: Keycloak session state identifier
            expires_in: Token expiration time in seconds (default: 600 = 10 minutes)

        Returns:
            JWT token string
        """
        now = datetime.now(timezone.utc)
        payload = {
            "user_id": user_id,
            "session_state_id": session_state_id,
            "exp": now + timedelta(seconds=expires_in),
            "iat": now,
        }

        return jwt.encode(payload, self.secret_key, algorithm="HS256")

    def parse_state_token(self, token: str) -> StateTokenPayload:
        """Parse and validate state token.

        Args:
            token: JWT token string to parse

        Returns:
            StateTokenPayload with user_id and session_state_id

        Raises:
            InvalidStateTokenError: If token is expired or invalid
        """
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=["HS256"])
            return StateTokenPayload(
                user_id=payload["user_id"], session_state_id=payload["session_state_id"]
            )
        except jwt.ExpiredSignatureError:
            raise InvalidStateTokenError("State token has expired")
        except jwt.InvalidTokenError as e:
            raise InvalidStateTokenError(f"Invalid state token: {str(e)}")
        except KeyError as e:
            raise InvalidStateTokenError(f"Missing required field in state token: {str(e)}")
