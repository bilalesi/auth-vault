"""Test script to verify application startup configuration."""

import os
import sys

# Set minimal required environment variables
os.environ.update(
    {
        "DATABASE_URL": "postgresql+asyncpg://test:test@localhost:5432/test",
        "KEYCLOAK_ISSUER": "http://localhost:8080/realms/test",
        "KEYCLOAK_CLIENT_ID": "test-client",
        "KEYCLOAK_CLIENT_SECRET": "test-secret",
        "KEYCLOAK_REALM": "test",
        "KEYCLOAK_TOKEN_ENDPOINT": "http://localhost:8080/realms/test/protocol/openid-connect/token",
        "KEYCLOAK_AUTHORIZATION_ENDPOINT": "http://localhost:8080/realms/test/protocol/openid-connect/auth",
        "KEYCLOAK_INTROSPECTION_ENDPOINT": "http://localhost:8080/realms/test/protocol/openid-connect/token/introspect",
        "KEYCLOAK_REVOCATION_ENDPOINT": "http://localhost:8080/realms/test/protocol/openid-connect/revoke",
        "KEYCLOAK_USERINFO_ENDPOINT": "http://localhost:8080/realms/test/protocol/openid-connect/userinfo",
        "KEYCLOAK_ADMIN_URL": "http://localhost:8080/admin",
        "KEYCLOAK_REDIRECT_URI": "http://localhost:8000/api/auth/manager/offline-token/callback",
        "AUTH_MANAGER_TOKEN_VAULT_ENCRYPTION_KEY": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        "STATE_TOKEN_SECRET": "test-secret-key-for-state-tokens-min-32-chars",
    }
)

try:
    from app.config import get_settings
    from app.dependencies import (
        get_encryption_service,
        get_keycloak_service,
        get_state_token_service,
    )
    from app.main import app

    print("✓ Application imported successfully")

    # Test settings
    settings = get_settings()
    print(f"✓ Settings loaded: {settings.app_name}")

    # Test FastAPI app
    print(f"✓ FastAPI app created: {app.title}")
    print(f"✓ OpenAPI docs at: {app.docs_url}")
    print(f"✓ ReDoc docs at: {app.redoc_url}")

    # Test dependencies
    encryption_service = get_encryption_service()
    print(f"✓ Encryption service created: {type(encryption_service).__name__}")

    keycloak_service = get_keycloak_service()
    print(f"✓ Keycloak service created: {type(keycloak_service).__name__}")

    state_token_service = get_state_token_service()
    print(f"✓ State token service created: {type(state_token_service).__name__}")

    # Test middleware
    print(f"✓ Middleware count: {len(app.user_middleware)}")

    # Test exception handlers
    print(f"✓ Exception handlers registered: {len(app.exception_handlers)}")

    print("\n✅ All application setup tests passed!")
    sys.exit(0)

except Exception as e:
    print(f"\n❌ Application setup test failed: {e}")
    import traceback

    traceback.print_exc()
    sys.exit(1)
