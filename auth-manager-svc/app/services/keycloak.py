"""Keycloak OAuth/OIDC client service."""

import httpx

from app.config import KeycloakSettings
from app.core.exceptions import KeycloakError
from app.core.logging import get_logger
from app.models.domain import KeycloakTokenResponse, TokenIntrospection

logger = get_logger(__name__)


class KeycloakService:
    """Service for interacting with Keycloak OAuth/OIDC endpoints."""

    def __init__(self, settings: KeycloakSettings):
        """Initialize Keycloak service.

        Args:
            settings: Keycloak configuration settings
        """
        self.settings = settings
        self.client = httpx.AsyncClient(timeout=30.0)

    async def refresh_access_token(self, refresh_token: str) -> KeycloakTokenResponse:
        """Refresh access token using refresh token.

        Args:
            refresh_token: The refresh token to use

        Returns:
            KeycloakTokenResponse with new access token

        Raises:
            KeycloakError: If token refresh fails
        """
        data = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": self.settings.client_id,
            "client_secret": self.settings.client_secret,
        }

        logger.info("refresh_access_token", endpoint=self.settings.token_endpoint)

        response = await self.client.post(self.settings.token_endpoint, data=data)

        if response.status_code != 200:
            logger.error(
                "refresh_access_token_failed",
                status_code=response.status_code,
                error=response.text,
            )
            raise KeycloakError(
                f"Token refresh failed: {response.text}", status_code=response.status_code
            )

        logger.info("refresh_access_token_success", status_code=response.status_code)

        return KeycloakTokenResponse(**response.json())

    async def request_offline_token(self, refresh_token: str) -> KeycloakTokenResponse:
        """Request offline token with offline_access scope.

        Args:
            refresh_token: The refresh token to exchange

        Returns:
            KeycloakTokenResponse with offline token

        Raises:
            KeycloakError: If offline token request fails
        """
        data = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": self.settings.client_id,
            "client_secret": self.settings.client_secret,
            "scope": "offline_access",
        }

        logger.info("request_offline_token", endpoint=self.settings.token_endpoint)

        response = await self.client.post(self.settings.token_endpoint, data=data)

        if response.status_code != 200:
            logger.error(
                "request_offline_token_failed",
                status_code=response.status_code,
                error=response.text,
            )
            raise KeycloakError(
                f"Offline token request failed: {response.text}", status_code=response.status_code
            )

        logger.info("request_offline_token_success", status_code=response.status_code)

        return KeycloakTokenResponse(**response.json())

    async def introspect_token(self, token: str) -> TokenIntrospection:
        """Introspect token to check if it's active.

        Args:
            token: The token to introspect

        Returns:
            TokenIntrospection with token details

        Raises:
            KeycloakError: If token introspection fails
        """
        data = {
            "token": token,
            "client_id": self.settings.client_id,
            "client_secret": self.settings.client_secret,
        }

        logger.info("introspect_token", endpoint=self.settings.introspection_endpoint)

        response = await self.client.post(self.settings.introspection_endpoint, data=data)

        if response.status_code != 200:
            logger.error(
                "introspect_token_failed",
                status_code=response.status_code,
                error=response.text,
            )
            raise KeycloakError(
                f"Token introspection failed: {response.text}", status_code=response.status_code
            )

        logger.info("introspect_token_success", status_code=response.status_code)

        return TokenIntrospection(**response.json())

    async def revoke_token(self, token: str, token_type_hint: str = "refresh_token") -> None:
        """Revoke a token.

        Args:
            token: The token to revoke
            token_type_hint: Hint about token type (default: "refresh_token")

        Raises:
            KeycloakError: If token revocation fails
        """
        data = {
            "token": token,
            "token_type_hint": token_type_hint,
            "client_id": self.settings.client_id,
            "client_secret": self.settings.client_secret,
        }

        logger.info(
            "revoke_token",
            endpoint=self.settings.revocation_endpoint,
            token_type_hint=token_type_hint,
        )

        response = await self.client.post(self.settings.revocation_endpoint, data=data)

        if response.status_code not in [200, 204]:
            logger.error(
                "revoke_token_failed",
                status_code=response.status_code,
                error=response.text,
            )
            raise KeycloakError(
                f"Token revocation failed: {response.text}", status_code=response.status_code
            )

        logger.info("revoke_token_success", status_code=response.status_code)

    async def revoke_session(self, session_id: str) -> None:
        """Revoke Keycloak session using admin API.

        Args:
            session_id: The Keycloak session ID to revoke

        Raises:
            KeycloakError: If session revocation fails
        """
        admin_token = await self._get_admin_token()

        url = f"{self.settings.admin_url}/realms/{self.settings.realm}/sessions/{session_id}"
        headers = {"Authorization": f"Bearer {admin_token}"}

        logger.info("revoke_session", endpoint=url, session_id=session_id)

        response = await self.client.delete(url, headers=headers)

        if response.status_code not in [200, 204]:
            logger.error(
                "revoke_session_failed",
                status_code=response.status_code,
                error=response.text,
            )
            raise KeycloakError(
                f"Session revocation failed: {response.text}", status_code=response.status_code
            )

        logger.info("revoke_session_success", status_code=response.status_code)

    async def exchange_code_for_token(self, code: str, redirect_uri: str) -> KeycloakTokenResponse:
        """Exchange authorization code for tokens.

        Args:
            code: The authorization code from OAuth callback
            redirect_uri: The redirect URI used in the authorization request

        Returns:
            KeycloakTokenResponse with tokens

        Raises:
            KeycloakError: If code exchange fails
        """
        data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": self.settings.client_id,
            "client_secret": self.settings.client_secret,
        }

        logger.info("exchange_code_for_token", endpoint=self.settings.token_endpoint)

        response = await self.client.post(self.settings.token_endpoint, data=data)

        if response.status_code != 200:
            logger.error(
                "exchange_code_for_token_failed",
                status_code=response.status_code,
                error=response.text,
            )
            raise KeycloakError(
                f"Code exchange failed: {response.text}", status_code=response.status_code
            )

        logger.info("exchange_code_for_token_success", status_code=response.status_code)

        return KeycloakTokenResponse(**response.json())

    async def _get_admin_token(self) -> str:
        """Get admin access token for admin API calls.

        Returns:
            Admin access token string

        Raises:
            KeycloakError: If admin token request fails
        """
        data = {
            "grant_type": "client_credentials",
            "client_id": self.settings.client_id,
            "client_secret": self.settings.client_secret,
        }

        response = await self.client.post(self.settings.token_endpoint, data=data)
        if response.status_code != 200:
            raise KeycloakError(
                f"Admin token request failed: {response.text}", status_code=response.status_code
            )

        return response.json()["access_token"]

    async def close(self) -> None:
        """Close HTTP client and cleanup resources."""
        await self.client.aclose()
