#!/bin/bash

# Check Keycloak Consent Configuration
# This script helps verify if Keycloak is properly configured for consent

set -e

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8081}"
REALM="${KEYCLOAK_REALM:-SBO}"
CLIENT_ID="${KEYCLOAK_CLIENT_ID:-nextjs-app}"

echo "🔍 Checking Keycloak Consent Configuration"
echo "=========================================="
echo ""
echo "Keycloak URL: $KEYCLOAK_URL"
echo "Realm: $REALM"
echo "Client ID: $CLIENT_ID"
echo ""

# Check if Keycloak is running
echo "1. Checking if Keycloak is accessible..."
if curl -s -f "$KEYCLOAK_URL/auth" > /dev/null; then
    echo "   ✅ Keycloak is accessible"
else
    echo "   ❌ Keycloak is not accessible at $KEYCLOAK_URL"
    echo "   Please start Keycloak first"
    exit 1
fi

echo ""
echo "2. Manual Configuration Required:"
echo "   ================================"
echo ""
echo "   Please open Keycloak Admin Console and verify:"
echo ""
echo "   📍 URL: $KEYCLOAK_URL/auth/admin"
echo ""
echo "   Then follow these steps:"
echo ""
echo "   Step 1: Navigate to Clients"
echo "   ---------------------------"
echo "   • Select realm: $REALM"
echo "   • Click 'Clients' in left sidebar"
echo "   • Find and click: $CLIENT_ID"
echo ""
echo "   Step 2: Enable Consent Required"
echo "   --------------------------------"
echo "   • In 'Settings' tab, find:"
echo "     - Consent Required: Turn ON ✅"
echo "   • Click 'Save'"
echo ""
echo "   Step 3: Verify Client Scopes"
echo "   ----------------------------"
echo "   • Go to 'Client Scopes' tab"
echo "   • Verify 'offline_access' is in:"
echo "     - Default Client Scopes, OR"
echo "     - Optional Client Scopes"
echo "   • If not, click 'Add client scope' and add it"
echo ""
echo "   Step 4: Check Redirect URIs"
echo "   ---------------------------"
echo "   • In 'Settings' tab, verify:"
echo "     Valid Redirect URIs includes:"
echo "     - http://localhost:3000/*"
echo "     - http://localhost:3000/api/auth/manager/offline-callback"
echo ""
echo "   Step 5: Revoke Existing Consent"
echo "   --------------------------------"
echo "   • Go to 'Users' in left sidebar"
echo "   • Find your user and click it"
echo "   • Go to 'Consents' tab"
echo "   • Find '$CLIENT_ID' and click 'Revoke'"
echo ""
echo "   OR use User Account Console:"
echo "   📍 URL: $KEYCLOAK_URL/auth/realms/$REALM/account"
echo "   • Login as your user"
echo "   • Go to 'Applications'"
echo "   • Find your app and click 'Remove Access'"
echo ""

# Generate a test URL
echo ""
echo "3. Test Authorization URL"
echo "   ======================"
echo ""
echo "   After configuration, test with this URL:"
echo ""

STATE="test-$(date +%s)"
TEST_URL="$KEYCLOAK_URL/auth/realms/$REALM/protocol/openid-connect/auth?client_id=$CLIENT_ID&response_type=code&scope=openid+profile+email+offline_access&redirect_uri=http://localhost:3000/api/auth/manager/offline-callback&state=$STATE&prompt=consent"

echo "   $TEST_URL"
echo ""
echo "   Copy and paste this URL in your browser."
echo "   You should see the Keycloak consent screen."
echo ""

# Checklist
echo ""
echo "4. Configuration Checklist"
echo "   ========================"
echo ""
echo "   Before testing, ensure:"
echo "   [ ] Consent Required is ON"
echo "   [ ] offline_access scope is available"
echo "   [ ] Redirect URIs are configured"
echo "   [ ] Existing consent has been revoked"
echo "   [ ] Browser cache cleared (or use incognito)"
echo ""

echo "✅ Configuration guide complete!"
echo ""
echo "📖 For detailed instructions, see: KEYCLOAK_CONSENT_FIX.md"
echo ""
