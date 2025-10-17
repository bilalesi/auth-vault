#!/bin/bash

# Generate secrets for .env.local

echo "Generating secrets for Next.js + Keycloak Auth..."
echo ""

echo "NEXTAUTH_SECRET (for NextAuth.js):"
openssl rand -base64 32
echo ""

echo "TOKEN_VAULT_ENCRYPTION_KEY (for token encryption):"
openssl rand -hex 32
echo ""

echo "Copy these values to your .env.local file"
