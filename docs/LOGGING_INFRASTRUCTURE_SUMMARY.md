# Logging Infrastructure Implementation Summary

## Overview

Implemented a comprehensive structured logging system using Pino for the Next.js Keycloak authentication system. The logger provides consistent, secure, and performant logging across all components.

## Implementation

### 1. Dependencies Added

```json
{
  "pino": "10.1.0",
  "pino-pretty": "13.1.2"
}
```

### 2. Logger Module (`src/lib/logger/index.ts`)

Created a centralized logging module with the following features:

#### Event Types (`AuthLogEventDict`)

Predefined event types for consistent logging:

**Authentication Events**:

- `auth.login`, `auth.logout`, `auth.login_failed`
- `auth.session_created`, `auth.session_expired`

**Token Events**:

- `token.created`, `token.refreshed`, `token.revoked`
- `token.expired`, `token.validated`, `token.validation_failed`

**Offline Token Events**:

- `offline_token.requested`, `offline_token.granted`, `offline_token.revoked`
- `offline_token.consent_required`, `offline_token.consent_granted`, `offline_token.consent_denied`

**Keycloak Events**:

- `keycloak.request`, `keycloak.response`, `keycloak.error`

**Vault Events**:

- `vault.store`, `vault.retrieve`, `vault.delete`, `vault.error`

**API Events**:

- `api.request`, `api.response`, `api.error`

#### Log Context Interface

Structured context for all logs:

```typescript
interface LogContext {
  // User context
  userId?: string;
  username?: string;
  email?: string;

  // Token context
  tokenId?: string;
  tokenType?: string;
  persistentTokenId?: string;
  sessionState?: string;

  // Request context
  requestId?: string;
  method?: string;
  path?: string;
  statusCode?: number;

  // Operation context
  operation?: string;
  component?: string;
  duration?: number;

  // Error context
  error?: string;
  errorCode?: string;
  errorStack?: string;

  // Additional metadata
  [key: string]: any;
}
```

#### Core Functions

1. **`createLogger(context)`**: Create child logger with persistent context
2. **`debug(event, context, message?)`**: Log debug messages
3. **`info(event, context, message?)`**: Log info messages
4. **`warn(event, context, message?)`**: Log warning messages
5. **`error(event, context, error?, message?)`**: Log error messages
6. **`measureDuration(event, context, operation)`**: Measure and log operation duration

#### Configuration

- **Log Level**: Configurable via `LOG_LEVEL` env var (default: `debug` in dev, `info` in prod)
- **Pretty Print**: Enabled in development for human-readable logs
- **JSON Output**: Enabled in production for machine parsing
- **Sensitive Data Redaction**: Automatically redacts:
  - `password`, `token`, `accessToken`, `refreshToken`
  - `access_token`, `refresh_token`, `client_secret`
  - `encryptedToken`, `iv`, `authorization`

### 3. Documentation (`src/lib/logger/README.md`)

Comprehensive documentation including:

- Usage examples
- Event type reference
- Context field reference
- Configuration options
- Best practices
- Testing guidelines

## Features

### 1. Structured Logging

All logs include structured context data for easy filtering and analysis:

```typescript
info(AuthLogEventDict.tokenCreated, {
  userId: "user-123",
  tokenId: "token-456",
  tokenType: "offline",
  component: "TokenVault",
});
```

### 2. Security

Automatic redaction of sensitive fields:

```typescript
// Input
logger.info({ token: "secret-token", userId: "user-123" });

// Output (token is redacted)
{ "userId": "user-123" }
```

### 3. Performance Tracking

Built-in duration measurement:

```typescript
const result = await measureDuration(
  AuthLogEventDict.tokenRefreshed,
  { userId: "user-123" },
  async () => {
    return await keycloakClient.refreshAccessToken(token);
  }
);
// Logs: "token.refreshed completed in 245ms"
```

### 4. Environment-Aware

- **Development**: Pretty-printed, colorized logs with timestamps
- **Production**: JSON logs for log aggregation systems

### 5. Child Loggers

Create loggers with persistent context:

```typescript
const logger = createLogger({
  component: "KeycloakClient",
  userId: "user-123",
});

logger.info({ event: AuthLogEventDict.keycloakRequest });
// All logs from this logger include component and userId
```

## Usage Examples

### API Route

```typescript
import { info, error, AuthLogEventDict } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  info(AuthLogEventDict.apiRequest, {
    method: "GET",
    path: "/api/auth/manager/access-token",
  });

  try {
    // ... handle request

    info(AuthLogEventDict.apiResponse, {
      method: "GET",
      path: "/api/auth/manager/access-token",
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
        duration: Date.now() - startTime,
      },
      err
    );
    throw err;
  }
}
```

### Keycloak Client

```typescript
import { info, error, AuthLogEventDict } from "@/lib/logger";

async refreshAccessToken(refreshToken: string) {
  info(AuthLogEventDict.keycloakRequest, {
    component: "KeycloakClient",
    operation: "refreshAccessToken",
  });

  try {
    const response = await fetch(/* ... */);

    info(AuthLogEventDict.keycloakResponse, {
      component: "KeycloakClient",
      operation: "refreshAccessToken",
      statusCode: response.status,
    });

    return await response.json();
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

### Token Vault

```typescript
import { info, error, AuthLogEventDict } from "@/lib/logger";

async create(userId: string, token: string, type: string) {
  const tokenId = makeUUID();

  try {
    info(AuthLogEventDict.vaultStore, {
      component: "TokenVault",
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
      },
      err
    );
    throw err;
  }
}
```

## Log Output Examples

### Development

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
    duration: 45
```

### Production

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
{
  "level": 30,
  "time": "2025-10-19T12:34:57.123Z",
  "env": "production",
  "event": "token.created",
  "userId": "user-123",
  "tokenId": "token-456",
  "tokenType": "refresh",
  "component": "TokenVault",
  "duration": 45
}
```

## Benefits

1. **Consistency**: Standardized event types and context fields across all components
2. **Security**: Automatic redaction of sensitive data
3. **Performance**: Minimal overhead, async logging
4. **Debugging**: Rich context makes troubleshooting easier
5. **Monitoring**: Structured logs enable easy integration with log aggregation tools
6. **Compliance**: Audit trail for authentication and authorization events

## Next Steps (Task 12.3)

Integrate logging into all components:

1. Add logging to Keycloak client operations
2. Add logging to token vault operations
3. Add logging to API routes
4. Add logging to NextAuth callbacks
5. Log authentication events and errors

## Configuration

### Environment Variables

```bash
# Log level (debug, info, warn, error)
LOG_LEVEL=info

# Environment
NODE_ENV=production
```

### Example .env.local

```bash
# Development
LOG_LEVEL=debug
NODE_ENV=development
```

## Testing

```typescript
import { info, AuthLogEventDict } from "@/lib/logger";

// Test logging
info(AuthLogEventDict.login, {
  userId: "test-user",
  username: "test",
});

// Check console output or log file
```

## Files Created

1. `src/lib/logger/index.ts` - Main logger implementation
2. `src/lib/logger/README.md` - Comprehensive documentation
3. `LOGGING_INFRASTRUCTURE_SUMMARY.md` - This summary

## Dependencies

- `pino@10.1.0` - Fast, low-overhead logging library
- `pino-pretty@13.1.2` - Pretty printer for development

## Task Completion

✅ Task 12.2: Add logging infrastructure

- ✅ Set up logging library (pino)
- ✅ Define AuthLogEvent interface
- ✅ Create logger utility with structured logging
- ✅ Add log levels (debug, info, warn, error)
- ✅ Add sensitive data redaction
- ✅ Add performance tracking
- ✅ Create comprehensive documentation
