#!/bin/bash

echo "Testing OAuth Authorization Flow..."
echo ""

CLIENT_ID="cli"
REDIRECT_URI="http://localhost:3000/api/auth/callback/keycloak"
REALM="SBO"
KEYCLOAK_URL="http://localhost:8081/auth"

echo "1. Authorization URL (open this in browser):"
echo "${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/auth?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=openid%20profile%20email%20offline_access"
echo ""

echo "2. Testing if redirect URI is valid..."
echo "   Checking Keycloak client configuration..."
echo ""

echo "If you get 'invalid_redirect_uri' error, the redirect URI is not configured in Keycloak."
echo "Make sure these URIs are in the 'Valid redirect URIs' field:"
echo "  - http://localhost:3000/api/auth/callback/keycloak"
echo "  - http://localhost:3000/*"
