# Revoke Offline Token with Session Management - Summary

## Overview

Added a new POST endpoint for revoking offline tokens that intelligently manages Keycloak sessions. The endpoint checks if the token being revoked is the last one with a specific `session_state`, and only revokes the entire session if it's the last token.

## Changes Made

### 1. Storage Interface (`src/lib/auth/token-vault-interface.ts`)

Added new method:

```typescript
retrieveBySessionState(
  sessionState: string,
  excludeTokenId: string
): Promise<TokenVaultEntry[]>
```

Retrieves all tokens (offline and refresh) that share the same Keycloak session state, **excluding a specific token ID**. This follows the same API pattern as `retrieveDuplicateTokenHash` for consistency.

### 2. Postgres Implementation (`src/lib/auth/token-vault-postgres.ts`)

Implemented `retrieveBySessionState`:

- Queries `AuthVault` table by `sessionState` column
- Excludes the specified `tokenId` using `op.ne(f.id, excludeTokenId)`
- Returns all matching tokens ordered by creation date (newest first)
- Includes full token metadata

### 3. Redis Implementation (`src/lib/auth/token-vault-redis.ts`)

Implemented `retrieveBySessionState`:

- Scans all token keys using pattern matching
- Filters by `sessionState` field AND excludes the specified `tokenId`
- Returns matching tokens sorted by creation date
- Note: Less efficient than Postgres for large datasets

### 4. Keycloak Client (`src/lib/auth/keycloak-client.ts`)

Added two new methods:

#### `revokeSession(sessionId: string)`

- Calls Keycloak Admin API to delete a user session
- Endpoint: `DELETE /admin/realms/{realm}/sessions/{sessionId}`
- Requires admin token (obtained via client credentials)
- Extracts realm from issuer URL automatically

#### `getAdminToken()` (private)

- Gets admin access token using client credentials grant
- Used internally by `revokeSession`
- Caches token for efficiency

### 5. Revoke Endpoint (`src/app/api/auth/manager/revoke-offline-token/route.ts`)

#### New POST Method

**Endpoint**: `POST /api/auth/manager/revoke-offline-token`

**Request Body**:

```json
{
  "persistentTokenId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response**:

```json
{
  "success": true,
  "message": "Offline token deleted and session revoked successfully",
  "sessionRevoked": true,
  "tokensWithSameSession": 0
}
```

**Logic Flow**:

1. Validates user authentication
2. Retrieves token entry by `persistentTokenId`
3. Verifies user owns the token
4. Checks token is an offline token (not refresh)
5. Checks token is active (not pending)
6. Verifies token has a `session_state`
7. Finds all **OTHER** tokens with the same `session_state` (excluding this token)
8. Deletes the token from vault
9. **If no other tokens exist** (`length === 0`): Revokes the Keycloak session
10. **If other tokens exist** (`length > 0`): Keeps the session active

**Security Checks**:

- User must be authenticated
- User must own the token
- Token must be offline type
- Token must be active (not pending)
- Token must have a session_state

#### Existing DELETE Method

Kept for backward compatibility:

- Uses token hash to check for duplicates
- Revokes token in Keycloak if no duplicates found
- Does not manage sessions

### 6. List Offline Tokens Endpoint (`src/app/api/auth/manager/offline-tokens/route.ts`)

**Endpoint**: `GET /api/auth/manager/offline-tokens`

Returns all offline tokens for the authenticated user with metadata (excludes encrypted tokens and IVs for security).

## Flow Diagram

```
User Requests Token Revocation
       ↓
POST /api/auth/manager/revoke-offline-token
       ↓
Validate User & Token Ownership
       ↓
Retrieve Token Entry
       ↓
Check Token Type (must be offline)
       ↓
Check Token Status (must be active)
       ↓
Get session_state from Token
       ↓
Query: retrieveBySessionState(session_state, persistentTokenId)
       ↓
Count OTHER Tokens with Same Session (excluding this one)
       ↓
Delete Token from Vault
       ↓
┌──────────────────────────────────┐
│ Are there other tokens?          │
│ (otherTokensWithSameSession > 0) │
└──────────┬───────────────────────┘
           │
    ┌──────┴──────┐
    │             │
   NO            YES
    │             │
    ↓             ↓
Revoke Session   Keep Session Active
(Keycloak Admin API)
    │             │
    └──────┬──────┘
           ↓
Return Response
```

## Use Cases

### Use Case 1: Multiple Offline Tokens per Session

**Scenario**: User creates 3 tasks, each gets an offline token from the same login session.

```
Session: b1d1f136-b27e-4816-6795-610538427259
├── Token 1 (Task A)
├── Token 2 (Task B)
└── Token 3 (Task C)
```

**Actions**:

1. User revokes Token 1 → Session stays active (2 tokens remain)
2. User revokes Token 2 → Session stays active (1 token remains)
3. User revokes Token 3 → **Session revoked** (last token)

### Use Case 2: Single Offline Token

**Scenario**: User creates 1 task with 1 offline token.

```
Session: a1b2c3d4-e5f6-7890-abcd-ef1234567890
└── Token 1 (Task A)
```

**Actions**:

1. User revokes Token 1 → **Session revoked immediately** (last token)

### Use Case 3: Mixed Token Types

**Scenario**: User has both refresh token and offline tokens in same session.

```
Session: x1y2z3a4-b5c6-d7e8-f9g0-h1i2j3k4l5m6
├── Refresh Token (NextAuth)
├── Offline Token 1 (Task A)
└── Offline Token 2 (Task B)
```

**Actions**:

1. User revokes Offline Token 1 → Session stays active
2. User revokes Offline Token 2 → **Session revoked** (last offline token)
3. Refresh token becomes invalid (session revoked)

## Benefits

1. **Efficient Session Management**: Only revokes sessions when truly no longer needed
2. **User Control**: Users can revoke individual tokens without affecting others
3. **Security**: Ensures sessions are cleaned up when all tokens are revoked
4. **Audit Trail**: Logs show exactly when and why sessions are revoked
5. **Backward Compatible**: Existing DELETE endpoint still works

## Testing

### Test Script

```bash
# 1. Create multiple tasks with offline tokens
curl -X POST http://localhost:3000/api/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Task 1"}'

# 2. Request offline tokens for each task
# (Follow consent flow for each)

# 3. List all offline tokens
curl http://localhost:3000/api/auth/manager/offline-tokens \
  -H "Authorization: Bearer $TOKEN"

# 4. Revoke one token (session should stay active)
curl -X POST http://localhost:3000/api/auth/manager/revoke-offline-token \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"persistentTokenId":"<token-id-1>"}'

# Response: { "sessionRevoked": false, "tokensWithSameSession": 1 }

# 5. Revoke last token (session should be revoked)
curl -X POST http://localhost:3000/api/auth/manager/revoke-offline-token \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"persistentTokenId":"<token-id-2>"}'

# Response: { "sessionRevoked": true, "tokensWithSameSession": 0 }
```

### Expected Console Logs

```
Found 2 token(s) with session_state: b1d1f136-b27e-4816-6795-610538427259
Session not revoked (1 other token(s) still exist): b1d1f136-b27e-4816-6795-610538427259

Found 1 token(s) with session_state: b1d1f136-b27e-4816-6795-610538427259
Session successfully revoked in Keycloak: b1d1f136-b27e-4816-6795-610538427259
```

## API Documentation

### POST /api/auth/manager/revoke-offline-token

Revokes an offline token and optionally the associated Keycloak session.

**Headers**:

- `Authorization: Bearer <access_token>`

**Body**:

```json
{
  "persistentTokenId": "uuid"
}
```

**Success Response** (200):

```json
{
  "success": true,
  "message": "Offline token deleted and session revoked successfully",
  "sessionRevoked": true,
  "tokensWithSameSession": 0
}
```

**Error Responses**:

- `401`: Unauthorized (invalid or missing token)
- `403`: Forbidden (user doesn't own the token)
- `404`: Token not found
- `400`: Invalid token type or pending token

### GET /api/auth/manager/offline-tokens

Lists all offline tokens for the authenticated user.

**Headers**:

- `Authorization: Bearer <access_token>`

**Success Response** (200):

```json
{
  "tokens": [
    {
      "id": "uuid",
      "userId": "user-id",
      "tokenType": "offline",
      "status": "active",
      "taskId": "task-id",
      "sessionState": "session-id",
      "createdAt": "2025-10-19T...",
      "expiresAt": "2026-10-19T...",
      "metadata": {}
    }
  ],
  "count": 1
}
```

## Security Considerations

1. **Admin Token**: The `getAdminToken()` method uses client credentials. Ensure the Keycloak client has proper admin permissions.
2. **Session Revocation**: Revoking a session invalidates ALL tokens (including refresh tokens) for that session.
3. **User Verification**: The endpoint verifies the user owns the token before allowing revocation.
4. **Token Exposure**: The list endpoint never exposes encrypted tokens or IVs.

## Future Enhancements

1. Add batch revocation endpoint
2. Add session management UI
3. Cache admin tokens to reduce Keycloak calls
4. Add webhook notifications for session revocations
5. Add session activity tracking
