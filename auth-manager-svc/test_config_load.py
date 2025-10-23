#!/usr/bin/env python3
"""Quick test script to verify configuration loading."""

import sys
from pathlib import Path

# Add app to path
sys.path.insert(0, str(Path(__file__).parent))

try:
    from app.config import get_settings

    print("Loading configuration...")
    settings = get_settings()

    print("\n✓ Configuration loaded successfully!")
    print(f"\nApp Name: {settings.app_name}")
    print(f"Version: {settings.version}")
    print(f"Debug: {settings.debug}")
    print(f"Log Level: {settings.log_level}")
    print(f"Port: {settings.port}")

    print(f"\nDatabase URL: {settings.database.url}")
    print(f"Database Pool Size: {settings.database.pool_size}")

    print(f"\nKeycloak Issuer: {settings.keycloak.issuer}")
    print(f"Keycloak Client ID: {settings.keycloak.client_id}")
    print(f"Keycloak Realm: {settings.keycloak.realm}")

    print(f"\nEncryption Key Length: {len(settings.encryption.token_vault_encryption_key)} chars")

    print(f"\nState Token Expiry: {settings.state_token.expiry} seconds")

    print(f"\nCORS Origins: {settings.cors.origins}")
    print(f"CORS Allow Credentials: {settings.cors.allow_credentials}")

    print("\n✓ All configuration settings validated successfully!")

except Exception as e:
    print(f"\n✗ Configuration loading failed: {e}")
    import traceback

    traceback.print_exc()
    sys.exit(1)
