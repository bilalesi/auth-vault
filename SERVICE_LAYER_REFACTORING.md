# Service Layer Refactoring

## Overview

Refactored API routes to separate business logic into a service layer, following clean architecture principles.

## Pattern

### Before (Monolithic Route)

```typescript
// src/app/api/auth/manager/access-token/route.ts
export async function GET(request: NextRequest) {
  // 120+ lines of business logic mixed with HTTP handling
  const validation = await validateRequest(request);
  const vault = GetStorage();
  const entry = await vault.retrieve(persistentTokenId);
  // ... more business logic
  return makeResponse({ accessToken, expiresIn });
}
```

### After (Separated Concerns)

**Service Layer** (`src/lib/services/access-token.service.ts`):

```typescript
import "server-only";

export interface GetAccessTokenParams {
  persistentTokenId: string;
  userId?: string;
}

export interface GetAccessTokenResult {
  accessToken: string;
  expiresIn: number;
}

export async function getAccessToken(
  params: GetAccessTokenParams
): Promise<GetAccessTokenResult> {
  // Pure business logic
  // No Request/Response objects
  // Returns typed data
}
```

**API Route** (`src/app/api/auth/manager/access-token/route.ts`):

```typescript
export async function GET(request: NextRequest) {
  // HTTP handling only
  const validation = await validateRequest(request);
  const { persistent_token_id } = await schema.parseAsync(query);

  const result = await getAccessToken({
    persistentTokenId: persistent_token_id,
    userId: validation.userId,
  });

  return makeResponse(result);
}
```

## Benefits

### 1. Separation of Concerns

- **API Routes**: Handle HTTP (request parsing, validation, response formatting)
- **Services**: Handle business logic (data retrieval, processing, validation)

### 2. Testability

- Services can be unit tested without HTTP mocking
- Pure functions with typed inputs/outputs
- No dependency on Next.js Request/Response objects

### 3. Reusability

- Services can be called from multiple routes
- Can be used in server actions, middleware, or other services
- Not tied to HTTP layer

### 4. Type Safety

- Explicit parameter interfaces
- Explicit return type interfaces
- Better IDE autocomplete and type checking

### 5. Security

- `import "server-only"` ensures services never run on client
- Clear boundary between client and server code

### 6. Documentation

- JSDoc on service functions
- Clear parameter and return type documentation
- Examples in JSDoc

## Structure

```
src/
├── app/
│   └── api/
│       └── auth/
│           └── manager/
│               └── access-token/
│                   └── route.ts          # HTTP layer (thin)
└── lib/
    └── services/
        └── access-token.service.ts       # Business logic (thick)
```

## Refactored Endpoints

### 1. access-token

**Service:** `src/lib/services/access-token.service.ts`

- Retrieves token from vault
- Validates token existence and expiration
- Decrypts token and exchanges with Keycloak
- Updates vault with new refresh token
- Returns access token and expiration

**Route:** `src/app/api/auth/manager/access-token/route.ts` (GET)

- Validates authentication
- Parses query parameters
- Calls service and formats response

### 2. offline-consent

**Service:** `src/lib/services/offline-consent.service.ts`

- Creates pending offline token entry in vault
- Generates authorization URL with offline_access scope
- Returns consent URL and persistent token ID

**Route:** `src/app/api/auth/manager/offline-consent/route.ts` (POST)

- Validates authentication
- Calls service and formats response

### 3. offline-callback

**Service:** `src/lib/services/offline-callback.service.ts`

- Validates state token
- Exchanges authorization code for offline token
- Encrypts and stores token in vault
- Returns success status

**Route:** `src/app/api/auth/manager/offline-callback/route.ts` (POST)

- Validates authentication
- Parses callback parameters
- Calls service and formats response

### 4. refresh-token-id

**Service:** `src/lib/services/refresh-token-id.service.ts`

- Retrieves user's refresh token from vault
- Returns persistent token ID and expiration

**Route:** `src/app/api/auth/manager/refresh-token-id/route.ts` (GET)

- Validates authentication
- Calls service and formats response

### 5. validate-token

**Service:** `src/lib/services/validate-token.service.ts`

- Placeholder for future validation logic
- Currently returns empty object (validation done by middleware)

**Route:** `src/app/api/auth/manager/validate-token/route.ts` (GET)

- Validates authentication
- Calls service and formats response

### 6. revoke-offline-token

**Service:** `src/lib/services/revoke-offline-token.service.ts`

- Validates token ownership and type
- Checks for other tokens with same session_state
- Deletes token from vault
- Revokes Keycloak session if last token
- Returns revocation status

**Route:** `src/app/api/auth/manager/revoke-offline-token/route.ts` (DELETE)

- Validates authentication
- Parses request body
- Calls service and formats response

## Remaining Endpoints

Apply the same pattern to:

1. `src/app/api/auth/manager/offline-tokens/route.ts` (list all offline tokens)

## Testing Example

```typescript
// services/access-token.service.test.ts
import { getAccessToken } from "./access-token.service";

describe("getAccessToken", () => {
  it("should return access token for valid persistent token ID", async () => {
    const result = await getAccessToken({
      persistentTokenId: "valid-uuid",
      userId: "user-123",
    });

    expect(result.accessToken).toBeDefined();
    expect(result.expiresIn).toBeGreaterThan(0);
  });

  it("should throw error for expired token", async () => {
    await expect(
      getAccessToken({
        persistentTokenId: "expired-uuid",
        userId: "user-123",
      })
    ).rejects.toThrow("token_expired");
  });
});
```

## Guidelines

### Service Functions Should:

- ✅ Use `import "server-only"`
- ✅ Have typed parameters (interface)
- ✅ Have typed return values (interface)
- ✅ Have JSDoc documentation
- ✅ Be named exports
- ✅ Accept parameters as a single object
- ✅ Throw `AuthManagerError` for business logic errors
- ✅ Include logging
- ❌ NOT use Request/Response objects
- ❌ NOT handle HTTP concerns
- ❌ NOT parse query/body parameters

### API Routes Should:

- ✅ Validate authentication
- ✅ Parse and validate parameters
- ✅ Call service functions
- ✅ Format responses
- ✅ Handle errors
- ❌ NOT contain business logic
- ❌ NOT interact with data stores directly
- ❌ NOT interact with external services directly

## File Naming

- Services: `{feature}.service.ts`
- Interfaces: Exported from service files
- Location: `src/lib/services/`
