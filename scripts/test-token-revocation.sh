#!/bin/bash

# Test script for offline token revocation with hash-based deduplication
# Usage: ./scripts/test-token-revocation.sh

set -e

echo "🧪 Testing Offline Token Revocation Logic"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq is required but not installed${NC}"
    echo "Install with: brew install jq (macOS) or apt-get install jq (Linux)"
    exit 1
fi

echo "Step 1: List current offline tokens"
echo "------------------------------------"
TOKENS_RESPONSE=$(curl -s -X GET \
  http://localhost:3000/api/auth/manager/offline-tokens \
  -H "Content-Type: application/json" \
  -b cookies.txt)

echo "$TOKENS_RESPONSE" | jq '.'
TOKEN_COUNT=$(echo "$TOKENS_RESPONSE" | jq -r '.count // 0')
echo -e "${YELLOW}Current offline tokens: $TOKEN_COUNT${NC}"
echo ""

if [ "$TOKEN_COUNT" -eq 0 ]; then
    echo -e "${YELLOW}No offline tokens found. Please create a task and request an offline token first.${NC}"
    echo "Visit: http://localhost:3000/tasks"
    exit 0
fi

# Get the first token ID
FIRST_TOKEN_ID=$(echo "$TOKENS_RESPONSE" | jq -r '.tokens[0].id')
echo -e "${GREEN}Testing with token ID: $FIRST_TOKEN_ID${NC}"
echo ""

echo "Step 2: Delete the offline token"
echo "---------------------------------"
DELETE_RESPONSE=$(curl -s -X DELETE \
  http://localhost:3000/api/auth/manager/offline-token-id \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d "{\"persistentTokenId\": \"$FIRST_TOKEN_ID\"}")

echo "$DELETE_RESPONSE" | jq '.'
echo ""

# Check if revocation happened
WAS_REVOKED=$(echo "$DELETE_RESPONSE" | jq -r '.revoked // false')

if [ "$WAS_REVOKED" = "true" ]; then
    echo -e "${GREEN}✅ Token was revoked in Keycloak (no other tasks using it)${NC}"
else
    echo -e "${YELLOW}⏭️  Token was NOT revoked in Keycloak (other tasks still using it)${NC}"
fi
echo ""

echo "Step 3: Verify token was deleted from vault"
echo "--------------------------------------------"
TOKENS_AFTER=$(curl -s -X GET \
  http://localhost:3000/api/auth/manager/offline-tokens \
  -H "Content-Type: application/json" \
  -b cookies.txt)

TOKEN_COUNT_AFTER=$(echo "$TOKENS_AFTER" | jq -r '.count // 0')
echo -e "${YELLOW}Offline tokens after deletion: $TOKEN_COUNT_AFTER${NC}"
echo ""

if [ "$TOKEN_COUNT_AFTER" -lt "$TOKEN_COUNT" ]; then
    echo -e "${GREEN}✅ Token successfully deleted from vault${NC}"
else
    echo -e "${RED}❌ Token count unchanged${NC}"
fi

echo ""
echo "=========================================="
echo "Test complete!"
echo ""
echo "Summary:"
echo "  - Initial tokens: $TOKEN_COUNT"
echo "  - Tokens after deletion: $TOKEN_COUNT_AFTER"
echo "  - Revoked in Keycloak: $WAS_REVOKED"
