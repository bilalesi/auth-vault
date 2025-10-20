# Logging Infrastructure

Structured logging system using Pino for the authentication and authorization system.

## Features

- **Structured Logging**: All logs include structured context data
- **Log Levels**: debug, info, warn, error
- **Event Types**: Predefined authentication event types
- **Sensitive Data Redaction**: Automatically redacts tokens and passwords
- **Pretty Printing**: Human-readable logs in development
- **JSON Logs**: Machine-readable logs in production
- **Performance Tracking**: Built-in duration measurement

## Usage

### Basic Logging

```typescript
import { info, error, AuthLogEventDict } from "@/lib/logger";

// Log an info message
info(AuthLogEventDict.login, {
  userId: "user-123",
  username: "john.doe",
});

// Log an error
error(
  AuthLogEventDict.keycloakError,
  {
    userId: "user-123",
    operation: "refreshToken",
  },
  new Error("Token refresh failed")
);
```

### With Context

```typescript
import { createLogger, AuthLogEventDict } from "@/lib/logger";

// Create a logger with persistent context
const logger = createLogger({
  component: "KeycloakClient",
  userId: "user-123",
});

logger.info({ event: AuthLogEventDict.keycloakRequest }, "Requesting token");
```

### Measure Duration

```typescript
import { measureDuration, AuthLogEventDict } from "@/lib/logger";

// Automatically log operation duration
const result = await measureDuration(
  AuthLogEventDict.tokenRefreshed,
  { userId: "user-123", tokenType: "refresh" },
  async () => {
    return await keycloakClient.refreshAccessToken(refreshToken);
  }
);
```

### Log Levels

```typescript
import { debug, info, warn, error, AuthLogEventDict } from "@/lib/logger";

// Debug (only in development or when LOG_LEVEL=debug)
debug(AuthLogEventDict.vaultRetrieve, {
  tokenId: "token-123",
  operation: "retrieve",
});

// Info (default level)
info(AuthLogEventDict.tokenCreated, {
  tokenId: "token-123",
  tokenType: "offline",
});

// Warning
warn(AuthLogEventDict.tokenExpired, {
  tokenId: "token-123",
  expiresAt: new Date().toISOString(),
});

// Error
error(
  AuthLogEventDict.vaultError,
  {
    operation: "store",
    tokenId: "token-123",
  },
  new Error("Database connection failed")
);
```

## Event Types

### Authentication Events

- `auth.login` - User login
- `auth.logout` - User logout
- `auth.login_failed` - Login attempt failed
- `auth.session_created` - Session created
- `auth.session_expired` - Session expired

### Token Events

- `token.created` - Token created
- `token.refreshed` - Token refreshed
- `token.revoked` - Token revoked
- `token.expired` - Token expired
- `token.validated` - Token validated
- `token.validation_failed` - Token validation failed

### Offline Token Events

- `offline_token.requested` - Offline token requested
- `offline_token.granted` - Offline token granted
- `offline_token.revoked` - Offline token revoked
- `offline_token.consent_required` - User consent required
- `offline_token.consent_granted` - User granted consent
- `offline_token.consent_denied` - User denied consent

### Keycloak Events

- `keycloak.request` - Request to Keycloak
- `keycloak.response` - Response from Keycloak
- `keycloak.error` - Keycloak error

### Vault Events

- `vault.store` - Token stored in vault
- `vault.retrieve` - Token retrieved from vault
- `vault.delete` - Token deleted from vault
- `vault.error` - Vault operation error

### API Events

- `api.request` - API request received
- `api.response` - API response sent
- `api.error` - API error

## Context Fields

### User Context

- `userId` - User ID
- `username` - Username
- `email` - User email

### Token Context

- `tokenId` - Token ID
- `tokenType` - Token type (refresh, offline)
- `persistentTokenId` - Persistent token ID
- `sessionState` - Keycloak session state

### Request Context

- `requestId` - Request ID
- `method` - HTTP method
- `path` - Request path
- `statusCode` - HTTP status code

### Operation Context

- `operation` - Operation name
- `component` - Component name
- `duration` - Operation duration in ms

### Error Context

- `error` - Error message
- `errorCode` - Error code
- `errorStack` - Error stack trace

## Configuration

### Environment Variables

- `LOG_LEVEL` - Log level (debug, info, warn, error). Default: `info` in production, `debug` in development
- `NODE_ENV` - Environment (development, production)

### Pretty Printing

Logs are output in JSON format by default. For human-readable logs in development, use:

```bash
pnpm dev:pretty
```

This pipes the output through pino-pretty for colorized, formatted logs.

### Sensitive Data Redaction

The following fields are automatically redacted from logs:

- `password`
- `token`
- `accessToken`
- `refreshToken`
- `access_token`
- `refresh_token`
- `client_secret`
- `encryptedToken`
- `iv`
- `authorization`

## Examples

### API Route Logging

```typescript
import { info, error, AuthLogEventDict } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    info(AuthLogEventDict.apiRequest, {
      method: "GET",
      path: "/api/auth/manager/access-token",
      userId: validation.userId,
    });

    // ... handle request

    info(AuthLogEventDict.apiResponse, {
      method: "GET",
      path: "/api/auth/manager/access-token",
      userId: validation.userId,
      statusCode: 200,
      duration: Date.now() - startTime,
    });

    return Response.json({ accessToken });
  } catch (err) {
    error(
      AuthLogEventDict.apiError,
      {
        method: "GET",
        path: "/api/auth/manager/access-token",
        userId: validation.userId,
        duration: Date.now() - startTime,
      },
      err
    );
    throw err;
  }
}
```

### Keycloak Client Logging

```typescript
import { info, error, AuthLogEventDict } from "@/lib/logger";

async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  info(AuthLogEventDict.keycloakRequest, {
    component: "KeycloakClient",
    operation: "refreshAccessToken",
  });

  try {
    const response = await fetch(this.config.tokenEndpoint, {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
    });

    if (!response.ok) {
      throw new Error("Token refresh failed");
    }

    const data = await response.json();

    info(AuthLogEventDict.keycloakResponse, {
      component: "KeycloakClient",
      operation: "refreshAccessToken",
      statusCode: response.status,
    });

    return data;
  } catch (err) {
    error(
      AuthLogEventDict.keycloakError,
      {
        component: "KeycloakClient",
        operation: "refreshAccessToken",
      },
      err
    );
    throw err;
  }
}
```

### Token Vault Logging

```typescript
import { info, error, AuthLogEventDict } from "@/lib/logger";

async create(
  userId: string,
  token: string,
  type: TAuthManagerTokenType,
  expiresAt: Date
): Promise<string> {
  const tokenId = makeUUID();

  try {
    info(AuthLogEventDict.vaultStore, {
      component: "TokenVault",
      operation: "create",
      userId,
      tokenId,
      tokenType: type,
    });

    // ... store token

    info(AuthLogEventDict.tokenCreated, {
      component: "TokenVault",
      userId,
      tokenId,
      tokenType: type,
    });

    return tokenId;
  } catch (err) {
    error(
      AuthLogEventDict.vaultError,
      {
        component: "TokenVault",
        operation: "create",
        userId,
        tokenId,
        tokenType: type,
      },
      err
    );
    throw err;
  }
}
```

## Log Output

### JSON Format (Default)

```json
{
  "level": 30,
  "time": "2025-10-19T12:34:56.789Z",
  "env": "development",
  "event": "auth.login",
  "userId": "user-123",
  "username": "john.doe",
  "component": "NextAuth"
}
```

### Pretty Format (with pnpm dev:pretty)

```
[12:34:56 UTC] INFO: auth.login
    event: "auth.login"
    userId: "user-123"
    username: "john.doe"
    component: "NextAuth"

[12:34:57 UTC] INFO: token.created
    event: "token.created"
    userId: "user-123"
    tokenId: "token-456"
    tokenType: "refresh"
    component: "TokenVault"
```

### Production (JSON)

```json
{
  "level": 30,
  "time": "2025-10-19T12:34:56.789Z",
  "env": "production",
  "event": "auth.login",
  "userId": "user-123",
  "username": "john.doe",
  "component": "NextAuth"
}
```

## Best Practices

1. **Always include context**: Provide userId, tokenId, operation, etc.
2. **Use appropriate log levels**: debug for verbose, info for normal, warn for issues, error for failures
3. **Log at boundaries**: Log at API entry/exit, external service calls, database operations
4. **Don't log sensitive data**: Tokens, passwords, etc. are automatically redacted
5. **Include duration for operations**: Use `measureDuration` or manually track timing
6. **Use structured data**: Pass objects, not string concatenation
7. **Be consistent**: Use predefined event types from `AuthLogEventDict`

## Testing

```typescript
import { info, AuthLogEventDict } from "@/lib/logger";

// Set log level for testing
process.env.LOG_LEVEL = "debug";

// Log test events
info(AuthLogEventDict.login, {
  userId: "test-user",
  username: "test",
});
```
