# Next.js + Keycloak Authentication System

A robust authentication and authorization system using Next.js 15 App Router with Keycloak as the identity provider.

## Features

- ✅ NextAuth.js v4 integration with Keycloak
- ✅ Automatic token refresh mechanism
- ✅ Offline token support for background tasks
- ✅ Session-based token management
- ✅ Token vault with PostgreSQL or Redis backend
- ✅ Secure token storage (encrypted)
- ✅ API routes for token management

## Prerequisites

- Node.js 18+ and pnpm
- Docker and Docker Compose
- PostgreSQL (via Docker)
- Keycloak (via Docker)

## Quick Start

### 1. Start Infrastructure

Start Keycloak and PostgreSQL:

```bash
docker-compose up -d
```

Wait for services to be ready:

```bash
docker-compose logs -f keycloak
```

### 2. Configure Keycloak

Follow the detailed setup guide in [KEYCLOAK_SETUP.md](./KEYCLOAK_SETUP.md) to:

1. Access Keycloak admin console at `http://localhost:8081/auth/admin`
2. Create a client named `nextjs-app`
3. Configure OAuth settings
4. Get the client secret
5. Create a test user

### 3. Install Dependencies

```bash
pnpm install
```

### 4. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env.local
```

Update `.env.local` with your Keycloak client secret:

```bash
KEYCLOAK_CLIENT_SECRET=<your-client-secret-from-keycloak>
```

The other values are pre-configured for local development.

### 5. Run Database Migrations

```bash
pnpm db:push
```

### 6. Start Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── auth/
│   │   │       └── [...nextauth]/     # NextAuth.js route handler
│   │   ├── auth/
│   │   │   ├── signin/                # Sign-in page
│   │   │   └── error/                 # Error page
│   │   ├── layout.tsx                 # Root layout with SessionProvider
│   │   └── page.tsx                   # Home page
│   ├── components/
│   │   ├── session-provider.tsx       # NextAuth SessionProvider wrapper
│   │   ├── sign-in-button.tsx         # Sign-in button component
│   │   └── sign-out-button.tsx        # Sign-out button component
│   ├── lib/
│   │   ├── auth/                      # Auth utilities (token vault, etc.)
│   │   └── db/                        # Database utilities
│   ├── types/
│   │   └── auth.ts                    # TypeScript type definitions
│   └── auth.ts                        # NextAuth.js configuration
├── docker-compose.yml                 # Docker services (Keycloak, PostgreSQL)
├── KEYCLOAK_SETUP.md                  # Detailed Keycloak setup guide
└── .env.example                       # Environment variables template
```

## Environment Variables

| Variable                     | Description           | Default (Local)                                 |
| ---------------------------- | --------------------- | ----------------------------------------------- |
| `KEYCLOAK_ISSUER`            | Keycloak realm URL    | `http://localhost:8081/auth/realms/master`      |
| `KEYCLOAK_CLIENT_ID`         | OAuth client ID       | `nextjs-app`                                    |
| `KEYCLOAK_CLIENT_SECRET`     | OAuth client secret   | Get from Keycloak                               |
| `NEXTAUTH_URL`               | Application URL       | `http://localhost:3000`                         |
| `NEXTAUTH_SECRET`            | NextAuth.js secret    | Generate with `openssl rand -base64 32`         |
| `TOKEN_VAULT_STORAGE`        | Storage backend       | `postgres` or `redis`                           |
| `TOKEN_VAULT_ENCRYPTION_KEY` | Encryption key        | Generate with `openssl rand -hex 32`            |
| `DATABASE_URL`               | PostgreSQL connection | `postgresql://vault:vault@localhost:5433/vault` |

## Architecture

### Token Flow

1. **User Login**: User authenticates via Keycloak → NextAuth.js receives tokens → Tokens stored in encrypted session cookie
2. **Token Refresh**: NextAuth.js automatically refreshes access tokens using refresh tokens before expiration
3. **Offline Tokens**: For background tasks, offline tokens are stored in the database and can be used after user logout

### NextAuth.js Configuration

- **Session Strategy**: JWT (tokens stored in encrypted HTTP-only cookies)
- **Token Refresh**: Automatic refresh 2 minutes before expiration
- **Scopes**: `profile openid email offline_access`
- **Session Duration**: 10 hours

### Security Features

- HTTP-only session cookies
- Encrypted JWT tokens
- Secure token storage (AES-256-GCM for offline tokens)
- PKCE flow enabled
- CSRF protection

## Development

### Available Scripts

```bash
# Start development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Run linter
pnpm lint

# Database operations
pnpm db:push        # Push schema changes
pnpm db:studio      # Open database GUI
```

### Testing Authentication

1. Navigate to `http://localhost:3000`
2. Click "Sign in with Keycloak"
3. Login with test credentials:
   - Username: `testuser`
   - Password: `password123`
4. You should see your user information on the home page

## API Routes

### Token Management Endpoints

- `POST /api/auth/token/refresh-token` - Get refresh token from session
- `POST /api/auth/token/offline-id` - Request offline token for background tasks
- `POST /api/auth/token/access` - Exchange persistent token ID for access token
- `DELETE /api/auth/token/offline-id` - Revoke offline token

## Troubleshooting

### Keycloak Connection Issues

- Verify Keycloak is running: `docker-compose ps`
- Check Keycloak logs: `docker-compose logs keycloak`
- Ensure Keycloak is accessible at `http://localhost:8081/auth`

### Authentication Errors

- Verify client secret matches in Keycloak and `.env.local`
- Check redirect URIs in Keycloak client settings
- Ensure `offline_access` scope is enabled

### Database Connection Issues

- Verify PostgreSQL is running: `docker-compose ps`
- Check database credentials in `.env.local`
- Test connection: `psql postgresql://vault:vault@localhost:5433/vault`

## Production Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment guidelines.

## Documentation

- [Keycloak Setup Guide](./KEYCLOAK_SETUP.md) - Detailed Keycloak configuration
- [Requirements](./kiro/specs/nextjs-keycloak-auth/requirements.md) - System requirements
- [Design Document](./kiro/specs/nextjs-keycloak-auth/design.md) - Architecture and design decisions
- [Implementation Tasks](./kiro/specs/nextjs-keycloak-auth/tasks.md) - Development roadmap

## License

MIT
