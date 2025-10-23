"""Configuration management using Pydantic Settings."""

from typing import List

from pydantic import Field, PostgresDsn, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class DatabaseSettings(BaseSettings):
    """Database configuration settings."""

    url: PostgresDsn = Field(..., description="PostgreSQL database URL with asyncpg driver")
    pool_size: int = Field(default=10, ge=1, le=100, description="Database connection pool size")
    max_overflow: int = Field(
        default=20,
        ge=0,
        le=100,
        description="Maximum number of connections that can be created beyond pool_size",
    )
    pool_timeout: int = Field(
        default=30,
        ge=1,
        le=300,
        description="Timeout in seconds for getting a connection from the pool",
    )
    echo: bool = Field(default=False, description="Enable SQLAlchemy query logging")

    model_config = SettingsConfigDict(env_prefix="DATABASE_", case_sensitive=False)


class KeycloakSettings(BaseSettings):
    """Keycloak OAuth/OIDC configuration settings."""

    issuer: str = Field(..., description="Keycloak issuer URL")
    client_id: str = Field(..., description="Keycloak client ID")
    client_secret: str = Field(..., description="Keycloak client secret")
    realm: str = Field(..., description="Keycloak realm name")
    token_endpoint: str = Field(..., description="Keycloak token endpoint URL")
    authorization_endpoint: str = Field(..., description="Keycloak authorization endpoint URL")
    introspection_endpoint: str = Field(
        ..., description="Keycloak token introspection endpoint URL"
    )
    revocation_endpoint: str = Field(..., description="Keycloak token revocation endpoint URL")
    userinfo_endpoint: str = Field(..., description="Keycloak userinfo endpoint URL")
    admin_url: str = Field(..., description="Keycloak admin API base URL")
    redirect_uri: str = Field(..., description="OAuth callback redirect URI")

    model_config = SettingsConfigDict(env_prefix="KEYCLOAK_", case_sensitive=False)


class EncryptionSettings(BaseSettings):
    """Token encryption configuration settings."""

    token_vault_encryption_key: str = Field(
        ...,
        min_length=64,
        max_length=64,
        description="64-character hex string (32 bytes) for AES-256 encryption",
    )

    @field_validator("token_vault_encryption_key")
    @classmethod
    def validate_encryption_key(cls, v: str) -> str:
        """Validate that the encryption key is a valid 64-character hex string."""
        if len(v) != 64:
            raise ValueError("Encryption key must be exactly 64 characters")

        try:
            # Verify it's valid hex
            bytes.fromhex(v)
        except ValueError:
            raise ValueError("Encryption key must be a valid hexadecimal string")

        return v

    model_config = SettingsConfigDict(env_prefix="AUTH_MANAGER_", case_sensitive=False)


class StateTokenSettings(BaseSettings):
    """State token configuration settings."""

    secret: str = Field(..., min_length=32, description="Secret key for signing state tokens")
    expiry: int = Field(
        default=600,
        ge=60,
        le=3600,
        description="State token expiry time in seconds (default: 10 minutes)",
    )

    model_config = SettingsConfigDict(env_prefix="STATE_TOKEN_", case_sensitive=False)


class CORSSettings(BaseSettings):
    """CORS configuration settings."""

    origins: List[str] = Field(
        default=["http://localhost:3000"], description="Allowed CORS origins"
    )
    allow_credentials: bool = Field(default=True, description="Allow credentials in CORS requests")

    @field_validator("origins", mode="before")
    @classmethod
    def parse_origins(cls, v):
        """Parse comma-separated origins string into list."""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v

    model_config = SettingsConfigDict(env_prefix="CORS_", case_sensitive=False)


class AppSettings(BaseSettings):
    """Main application settings that aggregates all configuration."""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", case_sensitive=False, extra="ignore"
    )

    # Application metadata
    app_name: str = Field(default="Auth Manager Service", description="Application name")
    version: str = Field(default="1.0.0", description="Application version")
    debug: bool = Field(default=False, description="Enable debug mode")
    log_level: str = Field(
        default="INFO", description="Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)"
    )
    port: int = Field(default=8000, ge=1, le=65535, description="Application port")

    # Nested configuration settings
    database: DatabaseSettings
    keycloak: KeycloakSettings
    encryption: EncryptionSettings
    state_token: StateTokenSettings
    cors: CORSSettings

    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        """Validate log level is one of the allowed values."""
        allowed_levels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        v_upper = v.upper()
        if v_upper not in allowed_levels:
            raise ValueError(f"Log level must be one of {allowed_levels}, got '{v}'")
        return v_upper


# Global settings instance
_settings: AppSettings | None = None


def get_settings() -> AppSettings:
    """
    Get the global settings instance.

    This function implements a singleton pattern to ensure settings
    are loaded only once and reused across the application.

    Returns:
        AppSettings: The application settings instance

    Raises:
        ValidationError: If required environment variables are missing or invalid
    """
    global _settings
    if _settings is None:
        _settings = AppSettings()
    return _settings


def reset_settings() -> None:
    """
    Reset the global settings instance.

    This is primarily useful for testing purposes to reload settings
    with different environment variables.
    """
    global _settings
    _settings = None
