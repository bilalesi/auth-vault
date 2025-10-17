#!/bin/bash

echo "Testing Keycloak API responses to verify data shapes..."
echo ""

# First, let's get a token using client credentials (if service account is enabled)
echo "=== 1. Testing Token Endpoint (client_credentials) ==="
TOKEN_RESPONSE=$(curl -s -X POST "http://localhost:8081/auth/realms/SBO/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=cli" \
  -d "client_secret=D8vS0EkJrqLxD5C22SbY6dMyT4MC4dr8" \
  -d "grant_type=client_credentials")

echo "$TOKEN_RESPONSE" | python3 -m json.tool
echo ""

# If that fails, we need to use a real user token
# Let's check if we can get a token from the database or session
echo "=== 2. Checking for existing user session ==="
echo "Please log in at http://localhost:3000 first, then we'll extract the token"
echo ""

# For now, let's document what we need to test
echo "=== Endpoints to test with real tokens: ==="
echo "1. Token endpoint (refresh_token grant)"
echo "2. Token introspection endpoint"
echo "3. Userinfo endpoint"
echo "4. Token revocation endpoint"
echo ""
echo "We need a valid access_token and refresh_token from a logged-in user."
