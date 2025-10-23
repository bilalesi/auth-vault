"""Test configuration validation."""

import os
import sys
from pathlib import Path

# Add app directory to path
sys.path.insert(0, str(Path(__file__).parent))

from app.config import (
    AppSettings,
    CORSSettings,
    DatabaseSettings,
    EncryptionSettings,
    KeycloakSettings,
    StateTokenSettings,
    get_settings,
    reset_settings,
)


def test_configuration_loading():
    """Test that configuration loads successfully with valid environment variables."""

    # Set up test environment variables
    os.environ.update(
        {
            # App settings
            "APP_NAME": "Test Auth Manager",
            "VERSION": "1.0.0",
            "DEBUG": "false",
            "LOG_LEVEL": "INFO",
            "PORT": "8000",
            # Database settings
            "DATABASE_URL": "postgresql+asyncpg://user:pass@localhost:5432/testdb",
            "DATABASE_POOL_SIZE": "10",
            "DATABASE_MAX_OVERFLOW": "20",
            "DATABASE_POOL_TIMEOUT": "30",
            "DATABASE_ECHO": "false",
            # Keycloak settings
            "KEYCLOAK_ISSUER": "http://localhost:8080/realms/test",
            "KEYCLOAK_CLIENT_ID": "test-client",
            "KEYCLOAK_CLIENT_SECRET": "test-secret",
            "KEYCLOAK_REALM": "test",
            "KEYCLOAK_TOKEN_ENDPOINT": "http://localhost:8080/realms/test/protocol/openid-connect/token",
            "KEYCLOAK_INTROSPECTION_ENDPOINT": "http://localhost:8080/realms/test/protocol/openid-connect/token/introspect",
            "KEYCLOAK_REVOCATION_ENDPOINT": "http://localhost:8080/realms/test/protocol/openid-connect/revoke",
            "KEYCLOAK_USERINFO_ENDPOINT": "http://localhost:8080/realms/test/protocol/openid-connect/userinfo",
            "KEYCLOAK_ADMIN_URL": "http://localhost:8080/admin",
            # Encryption settings
            "AUTH_MANAGER_TOKEN_VAULT_ENCRYPTION_KEY": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            # State token settings
            "STATE_TOKEN_SECRET": "test-secret-key-that-is-long-enough",
            "STATE_TOKEN_EXPIRY": "600",
            # CORS settings
            "CORS_ORIGINS": "http://localhost:3000,http://localhost:8000",
            "CORS_ALLOW_CREDENTIALS": "true",
        }
    )

    # Reset settings to force reload
    reset_settings()

    # Load settings
    settings = get_settings()

    # Verify app settings
    assert settings.app_name == "Test Auth Manager"
    assert settings.version == "1.0.0"
    assert settings.debug is False
    assert settings.log_level == "INFO"
    assert settings.port == 8000

    # Verify database settings
    assert "postgresql+asyncpg" in str(settings.database.url)
    assert settings.database.pool_size == 10
    assert settings.database.max_overflow == 20
    assert settings.database.pool_timeout == 30
    assert settings.database.echo is False

    # Verify Keycloak settings
    assert settings.keycloak.issuer == "http://localhost:8080/realms/test"
    assert settings.keycloak.client_id == "test-client"
    assert settings.keycloak.client_secret == "test-secret"
    assert settings.keycloak.realm == "test"

    # Verify encryption settings
    assert len(settings.encryption.token_vault_encryption_key) == 64

    # Verify state token settings
    assert len(settings.state_token.secret) >= 32
    assert settings.state_token.expiry == 600

    # Verify CORS settings
    assert len(settings.cors.origins) == 2
    assert "http://localhost:3000" in settings.cors.origins
    assert settings.cors.allow_credentials is True

    print("✅ All configuration validation tests passed!")
    return True


def test_encryption_key_validation():
    """Test that encryption key validation works correctly."""

    # Test invalid key length
    try:
        os.environ["AUTH_MANAGER_TOKEN_VAULT_ENCRYPTION_KEY"] = "tooshort"
        reset_settings()
        settings = get_settings()
        print("❌ Should have failed with short encryption key")
        return False
    except Exception as e:
        print(f"✅ Correctly rejected short encryption key: {type(e).__name__}")

    # Test invalid hex characters
    try:
        os.environ["AUTH_MANAGER_TOKEN_VAULT_ENCRYPTION_KEY"] = "g" * 64  # 'g' is not valid hex
        reset_settings()
        settings = get_settings()
        print("❌ Should have failed with invalid hex characters")
        return False
    except Exception as e:
        print(f"✅ Correctly rejected invalid hex characters: {type(e).__name__}")

    return True


def test_log_level_validation():
    """Test that log level validation works correctly."""

    # Set valid encryption key first
    os.environ["AUTH_MANAGER_TOKEN_VAULT_ENCRYPTION_KEY"] = (
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    )

    # Test invalid log level
    try:
        os.environ["LOG_LEVEL"] = "INVALID"
        reset_settings()
        settings = get_settings()
        print("❌ Should have failed with invalid log level")
        return False
    except Exception as e:
        print(f"✅ Correctly rejected invalid log level: {type(e).__name__}")

    # Test valid log levels
    for level in ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]:
        os.environ["LOG_LEVEL"] = level
        reset_settings()
        settings = get_settings()
        assert settings.log_level == level
        print(f"✅ Accepted valid log level: {level}")

    return True


if __name__ == "__main__":
    print("=" * 60)
    print("Testing Configuration Management")
    print("=" * 60)
    print()

    try:
        # Test 1: Basic configuration loading
        print("Test 1: Configuration Loading")
        print("-" * 60)
        test_configuration_loading()
        print()

        # Test 2: Encryption key validation
        print("Test 2: Encryption Key Validation")
        print("-" * 60)
        test_encryption_key_validation()
        print()

        # Test 3: Log level validation
        print("Test 3: Log Level Validation")
        print("-" * 60)
        test_log_level_validation()
        print()

        print("=" * 60)
        print("✅ ALL TESTS PASSED!")
        print("=" * 60)

    except Exception as e:
        print()
        print("=" * 60)
        print(f"❌ TEST FAILED: {e}")
        print("=" * 60)
        import traceback

        traceback.print_exc()
        sys.exit(1)
