#!/bin/bash

echo "Testing Keycloak endpoints..."
echo ""

echo "1. Testing authorization endpoint:"
curl -I "http://localhost:8081/auth/realms/SBO/protocol/openid-connect/auth" 2>&1 | head -1
echo ""

echo "2. Testing token endpoint:"
curl -I "http://localhost:8081/auth/realms/SBO/protocol/openid-connect/token" 2>&1 | head -1
echo ""

echo "3. Testing userinfo endpoint:"
curl -I "http://localhost:8081/auth/realms/SBO/protocol/openid-connect/userinfo" 2>&1 | head -1
echo ""

echo "4. Testing well-known configuration:"
curl -s "http://localhost:8081/auth/realms/SBO/.well-known/openid-configuration" | python3 -m json.tool | grep -E '"(issuer|authorization_endpoint|token_endpoint)"'
