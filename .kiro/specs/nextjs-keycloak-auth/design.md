# Design Document

## Overview

This design implements a robust authentication and authorization system using Next.js 15 App Router with Keycloak as the identity provider. The architecture supports three distinct token flows: web client authentication, Jupyter notebook token refresh, and background task execution with offline tokens.

**Core Principle**: NextAuth.js manages refresh tokens in encrypted JWT session cookies. Refresh tokens are retrieved from the NextAuth session at request time when needed. Database storage is only used for offline tokens (background tasks that run after user logout).

**Token Flow Summary**:

1. **Core Web App Login**: User logs in via Keycloak → NextAuth.js callback receives access token and refresh token → Tokens stored in encrypted JWT session cookie → NextAuth automatically updates refresh token when it changes
2. **Jupyter Notebook Access**: Jupyter Launcher retrieves refresh token from NextAuth session → Passes it to notebook environment → Notebook uses it to get fresh access tokens via API routes
3. **Background Task Access**: Task Manager requests offline token from Keycloak → Offline token stored encrypted in database with persistent token ID → Task uses persistent token ID to get fresh access tokens even after user logout
4. **Token Refresh**: API routes retrieve refresh token from NextAuth session (or offline token from database) → Exchange with Keycloak for new access token → Return to caller

The system uses Next.js API routes for all token management operations. NextAuth.js handles session-bound refresh tokens (stored in encrypted cookies), while the database stores only offline tokens for long-running background tasks. **No middleware.ts is used** - all token operations are explicit via API routes.

## Architecture

### High-Level Component Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        WC[Web Client Browser]
        JNC[Jupyter Notebook Code]
        TMC[Task Manager Code]
    end

    subgraph "Next.js Application"
        subgraph "Web Server"
            AR[App Router Pages]
            subgraph "Authentication Manager"
                NA[NextAuth.js]
                API[API Routes]
                TV[Token Vault]
            end
        end
    end

    subgraph "External Services"
        KC[Keycloak IdP]
        JL[Jupyter Launcher]
        TM[Task Manager]
        EC[EntityCore]
    end

    WC -->|HTTPS + Cookies| AR
    AR -->|Session Check| NA

    WC -->|Launch Notebook| JL
    JL -->|Request Token ID| API
    JL -->|Start Kernel| JNC

    WC -->|Launch Task| TM
    TM -->|Request Offline Token| API
    TM -->|Execute| TMC

    JNC -->|Token Refresh| API
    TMC -->|Token Refresh| API

    API -->|Store/Retrieve| TV
    NA -->|OAuth Flow| KC
    API -->|Token Exchange| KC

    JNC -->|API Calls| EC
    TMC -->|API Calls| EC
    AR -->|API Calls| EC
```

````

### Technology Stack

- **Next.js 15**: App Router with Server Components and API Routes
- **NextAuth.js v4**: Authentication orchestration with Keycloak provider
- **Keycloak**: OAuth2/OIDC identity provider (frontend connects directly via NextAuth)
- **Token Vault Storage (Abstracted)**:
  - **Option A**: PostgreSQL with Drizzle ORM
  - **Option B**: AWS ElastiCache Redis with ioredis client
  - Implementation uses abstraction layer to support either backend
  - Application configured to use one storage backend at runtime
- **Jose**: JWT token validation and manipulation
- **Zod**: Request/response validation and schema definitions
- **pnpm**: Package manager

## Key Design Decisions

### NextAuth.js Usage - Session-Based Token Management
- **Scope**: NextAuth.js is used in the Core Web App (main Next.js application)
- **Primary Purpose**: Handle OAuth2/OIDC flow with Keycloak and manage refresh tokens in encrypted session
- **Token Storage in Session**: NextAuth.js stores access token and refresh token in encrypted JWT session cookie
- **Automatic Token Updates**: NextAuth.js automatically updates the refresh token in the session when Keycloak issues a new one
- **Token Retrieval**: API routes can retrieve refresh token from NextAuth session at request time using `getServerSession()`
- **No Database for Refresh Tokens**: Session-bound refresh tokens are NOT stored in database - they live only in the encrypted session cookie
- **Direct Keycloak Integration**: Web Client interacts with Keycloak through NextAuth.js OAuth flow
- **API Routes for Token Operations**: Separate API routes handle token exchange and management for external services

### Token Vault Storage Abstraction (Offline Tokens Only)
- **Purpose**: Store ONLY offline tokens for background tasks that run after user logout
- **Refresh Tokens**: NOT stored in database - retrieved from NextAuth session at request time
- **Dual Backend Support**: The application supports both PostgreSQL and Redis for offline token storage
- **Runtime Configuration**: The storage backend is selected via environment variable `TOKEN_VAULT_STORAGE`
- **Abstraction Layer**: A common `TokenVault` interface with two implementations:
  - `PostgresTokenVault`: Uses Drizzle ORM for PostgreSQL
  - `RedisTokenVault`: Uses Upstash Redis client
- **Factory Pattern**: `createTokenVault()` factory function instantiates the correct implementation
- **Consistent API**: Both implementations provide identical interface for store/retrieve/delete/cleanup operations
- **Encryption**: Offline token encryption/decryption is handled consistently across both backends

### No Middleware Usage
- **Explicit Token Operations**: All token operations are performed explicitly via API route calls
- **No Automatic Refresh**: No middleware.ts file intercepts requests to refresh tokens automatically
- **On-Demand**: Services request fresh access tokens when needed via API endpoints

## Components and Interfaces

### 1. NextAuth.js Configuration (Core Web App)

**File**: `app/api/auth/[...nextauth]/route.ts`

NextAuth.js handles OAuth flow with Keycloak and manages tokens in encrypted session cookies.

```typescript
// Configuration structure
interface NextAuthConfig {
  providers: [
    KeycloakProvider({
      clientId: process.env.KEYCLOAK_CLIENT_ID,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
      issuer: process.env.KEYCLOAK_ISSUER,
    })
  ];
  callbacks: {
    async jwt({ token, account, user, profile }) {
      // Initial sign in - store tokens
      if (account && user) {
        return {
          ...token,
          accessToken: account.access_token,
          accessTokenExpires: account.expires_at ? account.expires_at * 1000 : null,
          refreshToken: account.refresh_token,
          user: {
            ...user,
            id: profile?.sub,
          },
          idToken: account.id_token,
        };
      }

      // Return previous token if the access token has not expired yet
      // Check if token expires in more than 2 minutes
      if (
        typeof token.accessTokenExpires === 'number' &&
        Date.now() < token.accessTokenExpires - 2 * 60 * 1000
      ) {
        return token;
      }

      // Access token has expired or is close to expiration, refresh it
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      return {
        user: {
          ...session.user,
          ...(token.user as Session['user']),
        },
        accessToken: token.accessToken as string,
        idToken: token.idToken,
        expires: new Date(token.accessTokenExpires as number).toISOString(),
        error: token.error as string,
      };
    },
  };
  session: {
    strategy: "jwt";
    maxAge: 12 * 60 * 60; // 12 hours
  };
  pages: {
    signIn: "/auth/signin";
    error: "/auth/error";
  };
}

// Helper function to refresh access token
async function refreshAccessToken(token: JWT) {
  try {
    const response = await fetch(
      `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.KEYCLOAK_CLIENT_ID!,
          client_secret: process.env.KEYCLOAK_CLIENT_SECRET!,
          grant_type: 'refresh_token',
          refresh_token: token.refreshToken as string,
        }),
      }
    );

    const refreshedTokens = await response.json();

    if (!response.ok) {
      throw refreshedTokens;
    }

    return {
      ...token,
      accessToken: refreshedTokens.access_token,
      accessTokenExpires: Date.now() + refreshedTokens.expires_in * 1000,
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
    };
  } catch (error) {
    console.error('Error refreshing access token', error);
    return {
      ...token,
      error: 'RefreshAccessTokenError',
    };
  }
}
```

**Key Responsibilities**:

- Handle OAuth2 authorization code flow with Keycloak
- Store access token and refresh token in encrypted JWT session cookie
- Automatically update refresh token when Keycloak issues a new one
- Provide tokens to server-side code via `getServerSession()`
- Never expose tokens to client-side JavaScript

**Token Storage Strategy**:

- Access token: Stored in encrypted JWT session cookie (server-side only)
- Refresh token: Stored in encrypted JWT session cookie (server-side only)
- Session cookie: HTTP-only, Secure, SameSite=Lax
- Tokens retrieved at request time: API routes use `getServerSession()` to access tokens
- No database storage needed: Tokens live in the encrypted session
- Refresh token: Stored in encrypted JWT session cookie (server-side only)
- Session cookie: HTTP-only, Secure, SameSite=Lax

### 2. Token Vault Service

**File**: `lib/auth/token-vault.ts`

Secure server-side storage for refresh and offline tokens.

```typescript
interface TokenVaultEntry {
  id: string; // Persistent token ID (UUID)
  userId: string;
  tokenType: "refresh" | "offline";
  encryptedToken: string;
  createdAt: Date;
  expiresAt: Date;
  metadata?: Record<string, any>;
}

interface TokenVault {
  store(userId: string, token: string, type: TokenType): Promise<string>;
  retrieve(tokenId: string): Promise<string | null>;
  delete(tokenId: string): Promise<void>;
  cleanup(): Promise<void>; // Remove expired tokens
}
```

**Implementation Options**:

**Option A: Database (Drizzle + PostgreSQL)**

- Pros: Persistent, queryable, supports complex cleanup logic
- Cons: Requires database setup, slightly slower
- Best for: Production environments with existing database

**Encryption**:

- Use AES-256-GCM for token encryption
- Store encryption key in environment variable (rotatable)
- Each token has unique IV (initialization vector)

### 4. Authentication Manager API Routes

#### POST /api/auth/token/refresh-id

**File**: `app/api/auth/token/refresh-id/route.ts`

Creates a persistent token ID for a refresh token.

```typescript
// Request
interface RefreshIdRequest {
  accessToken: string;
}

// Response
interface RefreshIdResponse {
  persistentTokenId: string;
  expiresAt: string; // ISO 8601
}

// Error Response
interface ErrorResponse {
  error: string;
  code: "INVALID_TOKEN" | "UNAUTHORIZED" | "INTERNAL_ERROR";
}
```

**Implementation Steps**:

1. Validate access token with Keycloak introspection endpoint
2. Extract user ID from access token
3. Retrieve refresh token from current session
4. Store refresh token in Token Vault
5. Return persistent token ID

#### POST /api/auth/token/offline-id

**File**: `app/api/auth/token/offline-id/route.ts`

Requests an offline token and returns a persistent token ID.

```typescript
// Request
interface OfflineIdRequest {
  accessToken: string;
  redirectUri?: string; // For consent flow
}

// Response
interface OfflineIdResponse {
  persistentTokenId?: string;
  consentUrl?: string; // If consent required
  expiresAt?: string;
}
```

**Implementation Steps**:

1. Validate access token
2. Request offline token from Keycloak with `offline_access` scope
3. If consent required, return consent URL
4. Handle consent callback
5. Store offline token in Token Vault
6. Return persistent token ID

**Consent Flow**:

- Keycloak redirects to consent page
- User approves offline access
- Keycloak redirects back with offline token
- Store token and return persistent token ID

#### POST /api/auth/token/access

**File**: `app/api/auth/token/access/route.ts`

Exchanges a persistent token ID for a fresh access token.

```typescript
// Request
interface AccessTokenRequest {
  persistentTokenId: string;
}

// Response
interface AccessTokenResponse {
  accessToken: string;
  expiresIn: number; // Seconds
  tokenType: "Bearer";
}
```

**Implementation Steps**:

1. Validate persistent token ID format
2. Retrieve token from Token Vault
3. Determine token type (refresh vs offline)
4. Exchange with Keycloak for new access token
5. Return new access token

**Token Exchange Logic**:

```typescript
if (tokenType === "refresh") {
  // Use refresh token grant
  newAccessToken = await keycloak.refreshToken(storedToken);
} else if (tokenType === "offline") {
  // Use offline token grant
  newAccessToken = await keycloak.offlineTokenRefresh(storedToken);
}
```

#### DELETE /api/auth/token/offline-id

**File**: `app/api/auth/token/offline-id/route.ts`

Revokes an offline token.

```typescript
// Request
interface RevokeOfflineTokenRequest {
  persistentTokenId: string;
}

// Response
interface RevokeOfflineTokenResponse {
  success: boolean;
  message: string;
}
```

**Implementation Steps**:

1. Validate persistent token ID
2. Retrieve offline token from Token Vault
3. Revoke token in Keycloak
4. Delete from Token Vault
5. Return success response

### 5. Keycloak Client Service

**File**: `lib/auth/keycloak-client.ts`

Abstraction layer for Keycloak API interactions.

```typescript
interface KeycloakClient {
  // Token operations
  refreshAccessToken(refreshToken: string): Promise<TokenResponse>;
  requestOfflineToken(accessToken: string): Promise<OfflineTokenResponse>;
  revokeToken(token: string): Promise<void>;
  introspectToken(token: string): Promise<TokenIntrospection>;

  // User operations
  getUserInfo(accessToken: string): Promise<UserInfo>;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

interface TokenIntrospection {
  active: boolean;
  exp?: number;
  iat?: number;
  sub?: string;
  scope?: string;
}
```

**Configuration**:

```typescript
interface KeycloakConfig {
  issuer: string; // https://keycloak.example.com/realms/myrealm
  clientId: string;
  clientSecret: string;
  tokenEndpoint: string;
  introspectionEndpoint: string;
  revocationEndpoint: string;
  userinfoEndpoint: string;
}
```

### 6. Server Actions for Client Components

**File**: `app/actions/auth.ts`

Server Actions provide a type-safe way for Client Components to interact with authentication.

```typescript
"use server";

export async function launchNotebook(): Promise<NotebookLaunchResult> {
  const session = await getServerSession();
  if (!session) throw new Error("Unauthorized");

  // Request persistent token ID
  const tokenId = await createRefreshTokenId(session.accessToken);

  // Call Jupyter Launcher
  const notebookUrl = await jupyterLauncher.launch({
    userId: session.user.id,
    accessToken: session.accessToken,
    persistentTokenId: tokenId,
  });

  return { notebookUrl, tokenId };
}

export async function launchBackgroundTask(
  taskConfig: TaskConfig
): Promise<TaskLaunchResult> {
  const session = await getServerSession();
  if (!session) throw new Error("Unauthorized");

  // Request offline token ID (may require consent)
  const offlineTokenResult = await createOfflineTokenId(session.accessToken);

  if (offlineTokenResult.consentUrl) {
    return { requiresConsent: true, consentUrl: offlineTokenResult.consentUrl };
  }

  // Launch task with offline token ID
  const taskId = await taskManager.launch({
    userId: session.user.id,
    config: taskConfig,
    persistentTokenId: offlineTokenResult.persistentTokenId,
  });

  return { taskId, persistentTokenId: offlineTokenResult.persistentTokenId };
}

export async function revokeBackgroundTask(
  persistentTokenId: string
): Promise<void> {
  await revokeOfflineToken(persistentTokenId);
}
```

## Data Models

### Session Data Structure

```typescript
interface Session {
  user: {
    id: string;
    email: string;
    name: string;
  };
  accessToken: string;
  refreshToken: string;
  accessTokenExpires: number; // Unix timestamp
  error?: "RefreshAccessTokenError";
}
```

### Token Vault Schema (Prisma)

```prisma
model TokenVaultEntry {
  id            String   @id @default(uuid())
  userId        String
  tokenType     String   // "refresh" | "offline"
  encryptedToken String  @db.Text
  iv            String   // Initialization vector for encryption
  createdAt     DateTime @default(now())
  expiresAt     DateTime
  metadata      Json?

  @@index([userId])
  @@index([expiresAt])
}
```

### Environment Variables

```bash
# Keycloak Configuration
KEYCLOAK_ISSUER=https://keycloak.example.com/realms/myrealm
KEYCLOAK_CLIENT_ID=nextjs-app
KEYCLOAK_CLIENT_SECRET=your-client-secret

# NextAuth Configuration
NEXTAUTH_URL=https://your-app.com
NEXTAUTH_SECRET=your-nextauth-secret

# Token Vault Encryption
TOKEN_VAULT_ENCRYPTION_KEY=your-256-bit-encryption-key

# Database (if using drizzle)
DATABASE_URL=postgresql://user:password@localhost:5432/authdb


# External Services
JUPYTER_LAUNCHER_URL=https://jupyter-launcher.example.com
TASK_MANAGER_URL=https://task-manager.example.com
ENTITY_CORE_URL=https://entity-core.example.com
```

## Error Handling

### Error Types and Recovery Strategies

```typescript
enum AuthErrorCode {
  // Token errors
  TOKEN_EXPIRED = "TOKEN_EXPIRED",
  TOKEN_INVALID = "TOKEN_INVALID",
  REFRESH_FAILED = "REFRESH_FAILED",

  // Session errors
  SESSION_EXPIRED = "SESSION_EXPIRED",
  SESSION_INVALID = "SESSION_INVALID",

  // Keycloak errors
  KEYCLOAK_UNAVAILABLE = "KEYCLOAK_UNAVAILABLE",
  KEYCLOAK_ERROR = "KEYCLOAK_ERROR",

  // Vault errors
  VAULT_ERROR = "VAULT_ERROR",
  TOKEN_NOT_FOUND = "TOKEN_NOT_FOUND",

  // Authorization errors
  UNAUTHORIZED = "UNAUTHORIZED",
  CONSENT_REQUIRED = "CONSENT_REQUIRED",
}

interface AuthError {
  code: AuthErrorCode;
  message: string;
  retryable: boolean;
  recoveryAction?: "LOGIN" | "RETRY" | "CONSENT";
}
```

### Error Handling Strategies

**Client-Side (Web Client)**:

- `TOKEN_EXPIRED` / `SESSION_EXPIRED`: Redirect to login page
- `KEYCLOAK_UNAVAILABLE`: Show error banner, retry after delay
- `UNAUTHORIZED`: Clear session, redirect to login

**Server-Side (API Routes)**:

- `REFRESH_FAILED`: Return 401, client redirects to login
- `VAULT_ERROR`: Log error, return 500, trigger alert
- `TOKEN_NOT_FOUND`: Return 404, client requests new token ID

**Jupyter Notebook / Task Manager**:

- `TOKEN_EXPIRED`: Automatically request new token via persistent token ID
- `TOKEN_NOT_FOUND`: Fail gracefully, log error, notify user
- `KEYCLOAK_UNAVAILABLE`: Retry with exponential backoff (max 3 attempts)

### Logging and Monitoring

```typescript
interface AuthLogEvent {
  timestamp: string;
  eventType: "TOKEN_REFRESH" | "TOKEN_CREATED" | "TOKEN_REVOKED" | "AUTH_ERROR";
  userId: string;
  tokenType?: "access" | "refresh" | "offline";
  success: boolean;
  errorCode?: AuthErrorCode;
  metadata?: Record<string, any>;
}
```

**Key Metrics to Track**:

- Token refresh success rate
- Token refresh latency
- Session duration distribution
- Offline token usage patterns
- Error rate by error code
- Keycloak API latency

## Testing Strategy

### Unit Tests

**Token Vault Service**:

- Test token encryption/decryption
- Test token storage and retrieval
- Test token expiration cleanup
- Test concurrent access handling

**Keycloak Client**:

- Mock Keycloak API responses
- Test token refresh logic
- Test error handling for various Keycloak errors
- Test token introspection

**API Routes**:

- Test request validation
- Test authentication checks
- Test token exchange flows
- Test error responses

### Integration Tests

**Authentication Flow**:

- Test complete OAuth flow with Keycloak
- Test session creation and cookie setting
- Test logout and session cleanup

**Token Refresh Flow**:

- Test NextAuth JWT callback token refresh logic
- Test proactive refresh before expiration (2 minute threshold)
- Test refresh on expired token
- Test refresh token rotation

**Persistent Token ID Flow**:

- Test refresh token ID creation
- Test offline token ID creation with consent
- Test access token retrieval
- Test token revocation

### End-to-End Tests

**Web Client Scenario**:

1. User logs in
2. User makes API calls
3. Token expires (or is close to expiration)
4. NextAuth JWT callback automatically refreshes token on next request
5. User continues working seamlessly

**Jupyter Notebook Scenario**:

1. User launches notebook
2. Notebook receives persistent token ID
3. Notebook code makes API calls
4. Access token expires
5. EntitySDK refreshes token automatically
6. Notebook continues execution

**Background Task Scenario**:

1. User launches background task
2. User grants offline access consent
3. Task receives offline token ID
4. User logs out
5. Task continues running
6. Task refreshes access token using offline token
7. Task completes successfully

### Security Testing

**Token Security**:

- Verify tokens never exposed to client-side JavaScript
- Verify refresh tokens never sent to browser
- Verify offline tokens never sent to Jupyter kernels
- Test token encryption strength

**Session Security**:

- Test session cookie security flags (HTTP-only, Secure, SameSite)
- Test session fixation prevention
- Test CSRF protection

**API Security**:

- Test authentication on all protected endpoints
- Test authorization checks
- Test rate limiting
- Test input validation

## Performance Considerations

### Caching Strategy

**Token Introspection Cache**:

- Cache valid token introspection results for 30 seconds
- Reduces load on Keycloak
- Invalidate on token refresh

**Session Cache**:

- Use Next.js built-in session caching
- Revalidate on token refresh

### Optimization Techniques

**Parallel Token Operations**:

- When launching notebook, request persistent token ID in parallel with other setup
- Use Promise.all for concurrent operations

**Connection Pooling**:

- Reuse HTTP connections to Keycloak
- Configure keep-alive for Keycloak client

**Database Optimization** (if using drizzle):

- Index on userId and expiresAt for fast queries
- Use connection pooling
- Implement read replicas for token retrieval

## Security Best Practices

### Token Storage

1. **Never expose sensitive tokens to client**:

   - Refresh tokens: Server-side only
   - Offline tokens: Server-side only
   - Access tokens: Short-lived, can be in session cookie

2. **Encrypt tokens at rest**:

   - Use AES-256-GCM encryption
   - Rotate encryption keys periodically
   - Store keys in secure secret management (e.g., AWS Secrets Manager)

3. **Use secure session cookies**:
   - HTTP-only flag prevents JavaScript access
   - Secure flag ensures HTTPS-only transmission
   - SameSite=Lax prevents CSRF attacks

### Token Lifecycle

1. **Implement token expiration**:

   - Access tokens: 1 hour
   - Refresh tokens: 12 hours
   - Offline tokens: 10 days
   - Cleanup expired tokens regularly

2. **Revoke tokens on logout**:

   - Invalidate refresh token in Keycloak
   - Clear session cookie
   - Remove tokens from vault

3. **Implement token rotation**:
   - Issue new refresh token on each refresh
   - Invalidate old refresh token
   - Prevents token replay attacks

### API Security

1. **Validate all inputs**:

   - Use Zod for request validation
   - Sanitize user inputs
   - Validate token formats

2. **Implement rate limiting**:

   - Limit token refresh requests per user
   - Prevent brute force attacks
   - Use sliding window algorithm

3. **Audit logging**:
   - Log all authentication events
   - Log token operations
   - Monitor for suspicious patterns

## Deployment Considerations

### Environment Setup

**Development**:

- Use local Keycloak instance (Docker)
- Use SQLite for token vault
- Disable HTTPS requirements for local testing

**Staging**:

- Use staging Keycloak realm
- Use PostgreSQL and Redis (to allow to use what he want not both in the same time) for token vault
- Enable HTTPS
- Test with production-like data

**Production**:

- Use production Keycloak realm
- Use managed database (e.g., AWS RDS)
- Enable all security features
- Implement monitoring and alerting

### Scaling Considerations

**Horizontal Scaling**:

- Next.js app can scale horizontally
- Token vault must be shared (database)
- Session cookies work across instances

**High Availability**:

- Deploy multiple Next.js instances behind load balancer
- Use managed database with replication
- Implement health checks

### Monitoring and Alerting

**Key Metrics**:

- Authentication success/failure rate
- Token refresh success rate
- API response times
- Error rates by endpoint
- Keycloak availability

**Alerts**:

- High authentication failure rate
- High token refresh failure rate
- Keycloak unavailable
- Database connection errors
- High API latency

## Migration and Rollout Strategy

### Phase 1: Core Authentication (Week 1-2)

- Implement NextAuth.js with Keycloak
- Implement JWT callback with token refresh logic
- Implement session management with encrypted cookies
- Deploy to staging

### Phase 2: Token Vault and API Routes (Week 3-4)

- Implement token vault service
- Implement persistent token ID endpoints
- Implement access token refresh endpoint
- Add comprehensive error handling

### Phase 3: Jupyter Integration (Week 5)

- Integrate with Jupyter Launcher
- Test notebook token refresh flow
- Deploy to staging for testing

### Phase 4: Offline Tokens and Task Manager (Week 6-7)

- Implement offline token flow
- Implement consent handling
- Integrate with Task Manager
- Test background task scenarios

### Phase 5: Production Rollout (Week 8)

- Security audit
- Performance testing
- Production deployment
- Monitor and iterate
````
