#!/bin/bash

echo "Fixing Keycloak Frontend URL..."
echo ""

# Wait for Keycloak to be ready
echo "Waiting for Keycloak to be ready..."
sleep 5

# Configure kcadm
echo "Configuring Keycloak admin CLI..."
docker-compose exec -T keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8081/auth \
  --realm master \
  --user admin \
  --password admin

echo ""
echo "Setting frontend URL for SBO realm..."
docker-compose exec -T keycloak /opt/keycloak/bin/kcadm.sh update realms/SBO \
  -s 'attributes.frontendUrl="http://localhost:8081/auth"'

echo ""
echo "Verifying the fix..."
curl -s http://localhost:8081/auth/realms/SBO/.well-known/openid-configuration | grep -o '"issuer":"[^"]*"'

echo ""
echo "Done! The issuer should now show: http://localhost:8081/auth/realms/SBO"
echo ""
echo "Please clear your browser cookies and try logging in again."
