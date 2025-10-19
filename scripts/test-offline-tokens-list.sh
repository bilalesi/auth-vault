#!/bin/bash

# Test script for listing offline tokens
# Usage: ./scripts/test-offline-tokens-list.sh

set -e

echo "🔍 Testing Offline Tokens List Endpoint"
echo "========================================"
echo ""

# Check if user is logged in
echo "1. Checking authentication..."
RESPONSE=$(curl -s http://localhost:3000/api/auth/session)
echo "Session response: $RESPONSE"
echo ""

# Extract access token (if using session-based auth, you might need to adjust this)
# For now, we'll assume you need to pass the session cookie

echo "2. Fetching offline tokens..."
TOKENS_RESPONSE=$(curl -s -X GET \
  http://localhost:3000/api/auth/manager/offline-tokens \
  -H "Content-Type: application/json" \
  -b cookies.txt)

echo "Offline tokens response:"
echo "$TOKENS_RESPONSE" | jq '.' || echo "$TOKENS_RESPONSE"
echo ""

# Count tokens
TOKEN_COUNT=$(echo "$TOKENS_RESPONSE" | jq -r '.count // 0' 2>/dev/null || echo "0")
echo "Total offline tokens: $TOKEN_COUNT"
echo ""

if [ "$TOKEN_COUNT" -gt 0 ]; then
  echo "✅ Found $TOKEN_COUNT offline token(s)"
  echo ""
  echo "Token details:"
  echo "$TOKENS_RESPONSE" | jq '.tokens[] | {id, status, taskId, createdAt, expiresAt}' 2>/dev/null || echo "Could not parse token details"
else
  echo "ℹ️  No offline tokens found for this user"
  echo "   Create one by visiting: http://localhost:3000/tasks"
  echo "   Then click 'Request Offline Token' on a task"
fi

echo ""
echo "✅ Test complete!"
