# Auth Manager Setup Guide

Complete guide for setting up the Auth Manager application locally and in production.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Keycloak Configuration](#keycloak-configuration)
4. [Database Setup](#database-setup)
5. [Environment Configuration](#environment-configuration)
6. [Running the Application](#running-the-application)
7. [Testing](#testing)
8. [Production Deployment](#production-deployment)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

- **Node.js** 18.x or higher
- **pnpm** 8.x or higher
- **Docker** and **Docker Compose**
- **Git**

### Optional Tools

- **Postman** or **curl** for API testing
- **pgAdmin** or **Adminer** for database management
- **Redis CLI** for Redis debugging

---

## Local Development Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd auth-manager
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Start Infrastructure Services

Start Keycloak, PostgreSQL, and Redis using Docker Compose:

```bash
docker-compose up -d
```

This will start:

- **Keycloak** on `http://localhost:8081/auth`
- **PostgreSQL** (Keycloak DB) on port 5432 (internal)
- **PostgreSQL** (Token Vault) on port 5433
- **Redis** on port 6379
- **Adminer** (DB UI) on `http://localhost:8080`

### 4. Wait for Services to Start

Check if Keycloak is ready:

```bash
curl http://localhost:8081/auth/health/ready
```

You should see: `{"status":"UP"}`

### 5. Verify Keycloak Realm Import

The `master` realm with the `nextjs-app` client should be automatically imported.

Verify by logging into Keycloak admin console:

- URL: `http://localhost:8081/auth/admin`
- Username: `admin`
- Password: `admin`

Check:

- Realm: `master` exists
- Client: `nextjs-app` exists
- User: `testuser` exists (password: `testpassword`)

---

## Keycloak Configuration

### Automatic Configuration (Recommended)

The docker-compose setup automatically imports the realm configuration from `keycloak/realm-export.json`.

This includes:

- Client: `nextjs-app`
- Client Secret: `your-client-secret-change-in-production`
- Test User: `testuser` / `testpassword`
- Redirect URIs configured for localhost:3000

### Manual Configuration (If Needed)

If automatic import fails, follow these steps:

#### 1. Create Client

1. Go to Keycloak Admin Console: `http://localhost:8081/auth/admin`
2. Login with `admin` / `admin`
3. Select `master` realm
4. Go to **Clients** → **Create client**
5. Configure:
   - **Client ID**: `nextjs-app`
   - **Client authentication**: ON
   - **Authorization**: OFF
   - **Standard flow**: ON
   - **Direct access grants**: ON

#### 2. Configure Client Settings

1. Go to **Settings** tab:

   - **Valid redirect URIs**:
     - `http://localhost:3000/*`
     - `http://localhost:3000/api/auth/callback/keycloak`
     - `http://localhost:3000/api/auth/manager/offline-callback`
   - **Valid post logout redirect URIs**: `http://localhost:3000/*`
   - **Web origins**: `http://localhost:3000`

2. Go to **Credentials** tab:
   - Copy the **Client secret** (you'll need this for `.env.local`)

#### 3. Create Test User

1. Go to **Users** → **Add user**
2. Configure:
   - **Username**: `testuser`
   - **Email**: `testuser@example.com`
   - **First name**: `Test`
   - **Last name**: `User`
   - **Email verified**: ON
3. Click **Create**
4. Go to **Credentials** tab:
   - Click **Set password**
   - Password: `testpassword`
   - Temporary: OFF

#### 4. Configure Client Scopes

Ensure the client has access to `offline_access` scope:

1. Go to **Clients** → `nextjs-app` → **Client scopes**
2. Verify `offline_access` is in **Optional client scopes**

---

## Database Setup

### Token Vault Database

The token vault uses a separate PostgreSQL database.

#### 1. Verify Database Connection

```bash
# Using psql
psql -h localhost -p 5433 -U vault -d vault

# Or using Adminer
# Open http://localhost:8080
# System: PostgreSQL
# Server: db
# Username: vault
# Password: vault
# Database: vault
```

#### 2. Run Migrations

```bash
pnpm drizzle-kit push
```

This creates the required tables:

- `token_vault` - Stores encrypted tokens
- `state_tokens` - Stores OAuth state tokens

#### 3. Verify Tables

```bash
pnpm tsx scripts/check-db.ts
```

Or manually:

```sql
-- Connect to database
psql -h localhost -p 5433 -U vault -d vault

-- List tables
\dt

-- Check token_vault schema
\d token_vault

-- Check state_tokens schema
\d state_tokens
```

### Database Scripts

Useful scripts in `scripts/` directory:

- `check-db.ts` - Verify database connection and schema
- `reset-db.ts` - Reset database (WARNING: deletes all data)
- `seed-db.ts` - Seed test data

---

## Environment Configuration

### 1. Copy Environment Template

```bash
cp .env.example .env.local
```

### 2. Generate Secrets

```bash
# Generate NextAuth secret (32 bytes base64)
openssl rand -base64 32

# Generate encryption key (32 bytes hex)
openssl rand -hex 32
```

Or use the provided script:

```bash
./scripts/generate-secrets.sh
```

### 3. Configure .env.local

```bash
# Keycloak Configuration
KEYCLOAK_ISSUER=http://localhost:8081/auth/realms/master
KEYCLOAK_CLIENT_ID=nextjs-app
KEYCLOAK_CLIENT_SECRET=your-client-secret-from-keycloak

# NextAuth Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generated-secret-from-step-2>

# Token Vault Configuration
TOKEN_VAULT_STORAGE=postgres
# Options: "postgres" or "redis"

# Token Vault Encryption (256-bit key)
TOKEN_VAULT_ENCRYPTION_KEY=<generated-key-from-step-2>

# PostgreSQL (Local docker-compose uses port 5433)
DATABASE_URL=postgresql://vault:vault@localhost:5433/vault

# Redis (Alternative to PostgreSQL)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_TLS=false
```

### 4. Verify Configuration

```bash
# Check if all required env vars are set
pnpm tsx -e "
import { config } from 'dotenv';
config({ path: '.env.local' });

const required = [
  'KEYCLOAK_ISSUER',
  'KEYCLOAK_CLIENT_ID',
  'KEYCLOAK_CLIENT_SECRET',
  'NEXTAUTH_URL',
  'NEXTAUTH_SECRET',
  'TOKEN_VAULT_ENCRYPTION_KEY',
  'DATABASE_URL'
];

const missing = required.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error('Missing required env vars:', missing);
  process.exit(1);
}
console.log('✓ All required environment variables are set');
"
```

---

## Running the Application

### Development Mode

```bash
pnpm dev
```

The application will be available at `http://localhost:3000`

### Production Build

```bash
# Build
pnpm build

# Start production server
pnpm start
```

### Verify Application

1. Open `http://localhost:3000`
2. Click "Sign In"
3. Login with `testuser` / `testpassword`
4. You should be redirected back to the app

---

## Testing

### Manual Testing

#### 1. Test Authentication

```bash
# Login and get access token (use browser or Postman)
# Then test validate endpoint
curl -X GET http://localhost:3000/api/auth/manager/validate-token \
  -H "Authorization: Bearer <your-access-token>"
```

#### 2. Test Refresh Token Flow

```bash
# Get refresh token ID
curl -X GET http://localhost:3000/api/auth/manager/refresh-token-id \
  -H "Authorization: Bearer <your-access-token>"

# Use the persistent token ID to get access token
curl -X GET "http://localhost:3000/api/auth/manager/access-token?persistent_token_id=<token-id>"
```

#### 3. Test Offline Token Flow

```bash
# Run the offline token test script
./scripts/test-offline-token.sh
```

### Automated Testing

```bash
# Run all tests
pnpm test

# Run specific test suite
pnpm test:unit
pnpm test:integration
pnpm test:e2e
```

### Test Scripts

The `scripts/` directory contains several test scripts:

- `test-keycloak-endpoints.sh` - Test Keycloak connectivity
- `test-offline-token.sh` - Test offline token flow
- `test-token-revocation.sh` - Test token revocation
- `test-offline-tokens-list.sh` - Test listing tokens

---

## Production Deployment

### Environment Variables

In production, ensure you:

1. **Change all secrets**:

   - Generate new `NEXTAUTH_SECRET`
   - Generate new `TOKEN_VAULT_ENCRYPTION_KEY`
   - Use production Keycloak client secret

2. **Update URLs**:

   - Set `KEYCLOAK_ISSUER` to production Keycloak
   - Set `NEXTAUTH_URL` to production domain
   - Update redirect URIs in Keycloak client

3. **Configure database**:

   - Use managed PostgreSQL service
   - Enable SSL/TLS connections
   - Set up backups

4. **Security settings**:
   - Enable HTTPS
   - Set secure cookie flags
   - Configure CORS properly
   - Enable rate limiting

### Docker Deployment

#### 1. Create Dockerfile

```dockerfile
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN corepack enable pnpm && pnpm build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
```

#### 2. Build and Run

```bash
# Build image
docker build -t auth-manager:latest .

# Run container
docker run -p 3000:3000 \
  --env-file .env.production \
  auth-manager:latest
```

### Kubernetes Deployment

See `k8s/` directory for Kubernetes manifests (if available).

### Health Checks

Configure health check endpoints:

- Liveness: `GET /api/health`
- Readiness: `GET /api/health/ready`

---

## Troubleshooting

### Common Issues

#### 1. Keycloak Connection Failed

**Symptom**: Cannot connect to Keycloak

**Solutions**:

- Verify Keycloak is running: `docker ps | grep keycloak`
- Check Keycloak logs: `docker logs <keycloak-container-id>`
- Verify `KEYCLOAK_ISSUER` URL is correct
- Test Keycloak health: `curl http://localhost:8081/auth/health`

#### 2. Database Connection Failed

**Symptom**: Cannot connect to PostgreSQL

**Solutions**:

- Verify database is running: `docker ps | grep postgres`
- Check connection string in `DATABASE_URL`
- Test connection: `psql -h localhost -p 5433 -U vault -d vault`
- Check database logs: `docker logs <postgres-container-id>`

#### 3. Token Encryption Failed

**Symptom**: Error encrypting/decrypting tokens

**Solutions**:

- Verify `TOKEN_VAULT_ENCRYPTION_KEY` is exactly 64 hex characters (32 bytes)
- Generate new key: `openssl rand -hex 32`
- Check for special characters in env file

#### 4. Redirect URI Mismatch

**Symptom**: Keycloak error "Invalid redirect URI"

**Solutions**:

- Verify redirect URIs in Keycloak client settings
- Check `NEXTAUTH_URL` matches your domain
- Ensure trailing slashes match
- Add wildcard: `http://localhost:3000/*`

#### 5. Offline Token Consent Not Working

**Symptom**: Cannot get offline token

**Solutions**:

- Verify `offline_access` scope is available
- Check client has `offline_access` in optional scopes
- Review Keycloak logs for consent errors
- Test with script: `./scripts/test-offline-token.sh`

### Debug Mode

Enable debug logging:

```bash
# In .env.local
DEBUG=true
LOG_LEVEL=debug
```

### Logs

Check application logs:

```bash
# Development
# Logs appear in terminal

# Production (Docker)
docker logs <container-id>

# Production (PM2)
pm2 logs auth-manager
```

### Database Debugging

```bash
# Check token vault entries
psql -h localhost -p 5433 -U vault -d vault -c "SELECT id, user_id, token_type, expires_at FROM token_vault;"

# Check state tokens
psql -h localhost -p 5433 -U vault -d vault -c "SELECT * FROM state_tokens;"

# Clear all tokens (for testing)
pnpm tsx scripts/reset-db.ts
```

---

## Additional Resources

- [API Reference](./API_REFERENCE.md) - Complete API documentation
- [Keycloak Setup](./KEYCLOAK_SETUP.md) - Detailed Keycloak configuration
- [Database Setup](./DATABASE_SETUP.md) - Database schema and migrations
- [Offline Token Flow](./OFFLINE_TOKEN_FLOW.md) - Offline token implementation details

---

## Support

For issues or questions:

1. Check this guide and other documentation
2. Review application logs
3. Check Keycloak admin console
4. Inspect database entries
5. Test with provided scripts
6. Create an issue in the repository

---

## Quick Start Checklist

- [ ] Install Node.js 18+ and pnpm
- [ ] Install Docker and Docker Compose
- [ ] Clone repository
- [ ] Run `pnpm install`
- [ ] Run `docker-compose up -d`
- [ ] Wait for services to start
- [ ] Copy `.env.example` to `.env.local`
- [ ] Generate secrets with `./scripts/generate-secrets.sh`
- [ ] Update `.env.local` with Keycloak client secret
- [ ] Run `pnpm drizzle-kit push`
- [ ] Run `pnpm dev`
- [ ] Open `http://localhost:3000`
- [ ] Login with `testuser` / `testpassword`
- [ ] Test API endpoints

---

**Last Updated**: 2024-01-01
