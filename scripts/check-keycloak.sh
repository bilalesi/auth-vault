#!/bin/bash

echo "🔍 Checking Keycloak Configuration..."
echo ""

# Check if Keycloak is running
echo "1. Checking if Keycloak is accessible..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/auth/ | grep -q "200\|302"; then
    echo "   ✅ Keycloak is running at http://localhost:8081/auth/"
else
    echo "   ❌ Keycloak is not accessible. Make sure docker-compose is running:"
    echo "      docker-compose up -d"
    exit 1
fi

echo ""

# Check master realm
echo "2. Checking master realm..."
if curl -s http://localhost:8081/auth/realms/master/.well-known/openid-configuration | grep -q "issuer"; then
    echo "   ✅ Master realm is accessible"
else
    echo "   ❌ Master realm is not accessible"
fi

echo ""

# Check SBO realm
echo "3. Checking SBO realm..."
if curl -s http://localhost:8081/auth/realms/SBO/.well-known/openid-configuration | grep -q "issuer"; then
    echo "   ✅ SBO realm exists and is accessible"
    echo "   💡 You can use: KEYCLOAK_ISSUER=http://localhost:8081/auth/realms/SBO"
else
    echo "   ⚠️  SBO realm does not exist"
    echo "   💡 Either create it in Keycloak admin console, or use master realm:"
    echo "      KEYCLOAK_ISSUER=http://localhost:8081/auth/realms/master"
fi

echo ""
echo "4. Current .env.local configuration:"
if [ -f .env.local ]; then
    echo "   KEYCLOAK_ISSUER=$(grep KEYCLOAK_ISSUER .env.local | cut -d '=' -f2)"
    echo "   KEYCLOAK_CLIENT_ID=$(grep KEYCLOAK_CLIENT_ID .env.local | cut -d '=' -f2)"
else
    echo "   ❌ .env.local file not found"
fi

echo ""
echo "📚 Next steps:"
echo "   1. Follow KEYCLOAK_CLI_CLIENT_SETUP.md to configure the 'cli' client"
echo "   2. Create a test user in Keycloak"
echo "   3. Run: pnpm dev"
echo "   4. Visit: http://localhost:3000"
