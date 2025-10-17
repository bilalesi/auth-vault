#!/bin/bash

# Test script for offline token ID generation endpoint
# This script tests the POST /api/auth/token/offline-id endpoint

set -e

echo "🧪 Testing Offline Token ID Generation Endpoint"
echo "================================================"
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "❌ Error: .env.local file not found"
    exit 1
fi

# Source environment variables
source .env.local

# Check required variables
if [ -z "$NEXTAUTH_URL" ]; then
    echo "❌ Error: NEXTAUTH_URL not set in .env.local"
    exit 1
fi

BASE_URL="${NEXTAUTH_URL:-http://localhost:3000}"

echo "📍 Base URL: $BASE_URL"
echo ""

# Note: This endpoint requires authentication
# You need to be logged in to test this endpoint
echo "⚠️  Note: This endpoint requires authentication"
echo "   Please log in to the application first, then use your browser's"
echo "   developer tools to get your session cookie and test manually."
echo ""
echo "   Example curl command:"
echo "   curl -X POST $BASE_URL/api/auth/token/offline-id \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -H 'Cookie: next-auth.session-token=YOUR_SESSION_TOKEN' \\"
echo "     -d '{}'"
echo ""
echo "   Expected response:"
echo "   {"
echo "     \"persistentTokenId\": \"uuid-here\","
echo "     \"expiresAt\": \"2024-01-01T00:00:00.000Z\","
echo "     \"tokenType\": \"offline\""
echo "   }"
echo ""
echo "✅ Endpoint created at: $BASE_URL/api/auth/token/offline-id"
