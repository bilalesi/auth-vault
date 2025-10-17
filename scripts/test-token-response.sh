#!/bin/bash

echo "Testing actual Keycloak token response format..."
echo ""
echo "Note: This requires a valid refresh token from an active session"
echo ""

# You would need to replace this with an actual refresh token from your session
# For now, let's check the OpenID Connect discovery document for supported fields

echo "Checking OpenID Connect discovery for token endpoint capabilities:"
curl -s "http://localhost:8081/auth/realms/SBO/.well-known/openid-configuration" | \
  python3 -c "
import sys, json
data = json.load(sys.stdin)
print('Token Endpoint:', data.get('token_endpoint'))
print('Grant Types Supported:', json.dumps(data.get('grant_types_supported'), indent=2))
print('Token Endpoint Auth Methods:', json.dumps(data.get('token_endpoint_auth_methods_supported'), indent=2))
print('Claims Supported:', json.dumps(data.get('claims_supported'), indent=2))
"
