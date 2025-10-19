# Offline Token Implementation Summary

## Overview

Implemented a comprehensive state-based OAuth consent flow for offline tokens with database tracking and automatic token exchange.

## Files Created

### 1. `src/lib/auth/state-token.ts`

Utilities for generating and parsing state tokens.

**Functions:**

- `generateStateToken(payload)`: Encodes userId, taskId, and persistentTokenId as base64url
- `parseStateToken(token)`: Decodes state token back to payload
- `isValidStateToken(token)`: Validates state token format

### 2. `src/app/api/auth/manager/offline-consent/route.ts`

Endpoint to initiate offline token consent flow.

**Features:**

- Creates pending token request in database
- Generates state token
- Builds Keycloak consent URL with URLSearchParams
- Returns consent URL, persistentTokenId, and stateToken

### 3. `src/app/api/auth/manager/offline-callback/route.ts`

OAuth callback handler for consent flow.

**Features:**

- Receives authorization code from Keycloak
- Parses and validates state token
- Exchanges code for offline token
- Updates database with encrypted token
- Sets status to 'active' or 'failed'

### 4. `drizzle/migrations/0002_add_offline_token_status.sql`

Database migration for new columns.

**Changes:**

- Makes `encrypted_token` and `iv` nullable
- Adds `status` column (pending/active/failed)
- Adds `task_id` column
- Adds `state_token` column
- Creates indexes on new columns

### 5. `OFFLINE_TOKEN_FLOW.md`

Comprehensive documentation of the flow.

**Sections:**

- Overview and architecture
- Database schema
- State token format
- API endpoints
- Complete flow example
- Database lifecycle
- Security notes

## Files Modified

### 1. `src/lib/db/schema.ts`

Updated token vault schema:

- Made `encryptedToken` and `iv` nullable
- Added `status`, `taskId`, `stateToken` fields
- Added indexes for new fields

### 2. `src/lib/auth/token-vault-interface.ts`

Extended interface with new methods:

- Added `OfflineTokenStatusDict` and `OfflineTokenStatus` type
- Updated `TokenVaultEntry` interface with new fields
- Added `createPendingOfflineToken()` method
- Added `updateOfflineTokenByState()` method
- Added `getByStateToken()` method
- Added `updateStateToken()` method

### 3. `src/lib/auth/token-vault-postgres.ts`

Implemented new interface methods:

- Fixed null handling for encrypted_token and iv
- Implemented `createPendingOfflineToken()`
- Implemented `updateOfflineTokenByState()`
- Implemented `getByStateToken()`
- Implemented `updateStateToken()`
- Updated `retrieve()` and `getUserTokens()` to handle nullable fields

### 4. `src/lib/auth/token-vault-redis.ts`

Implemented new interface methods:

- Updated `RedisTokenEntry` interface for nullable fields
- Implemented `createPendingOfflineToken()`
- Implemented `updateOfflineTokenByState()`
- Implemented `getByStateToken()`
- Implemented `updateStateToken()`
- Added `getStateTokenKey()` helper method
- Updated `retrieve()` to handle nullable fields

### 5. `src/app/api/auth/manager/offline-token-id/route.ts`

Updated to reference new consent flow:

- Updated documentation to mention consent endpoint
- Changed error message to guide users to consent endpoint
- Fixed null handling for encrypted tokens

## Key Features

### 1. State-Based Tracking

- State token encodes userId, taskId, and persistentTokenId
- State is stored in database for validation
- Enables automatic token updates after consent

### 2. Database Lifecycle

- **Pending**: Token request created, waiting for consent
- **Active**: Consent granted, token encrypted and stored
- **Failed**: Consent denied or exchange failed

### 3. Task Association

- Every offline token is associated with a task ID
- Enables tracking which tokens belong to which tasks
- Useful for task-specific token management

### 4. URLSearchParams Usage

- Consent URL built with URLSearchParams for proper encoding
- Cleaner and more maintainable than string concatenation
- Handles special characters correctly

### 5. Automatic Token Exchange

- Callback endpoint handles entire exchange process
- No manual intervention required after consent
- Updates database automatically

## API Flow

```
1. POST /api/auth/manager/offline-consent
   ↓ (creates pending request)
   Database: status='pending', encrypted_token=null
   ↓ (returns consent URL)

2. User visits consent URL
   ↓ (grants consent)
   Keycloak redirects to callback
   ↓

3. GET /api/auth/manager/offline-callback?code=...&state=...
   ↓ (exchanges code for token)
   ↓ (updates database)
   Database: status='active', encrypted_token='...'
   ↓ (returns success)

4. POST /api/auth/manager/access-token
   ↓ (uses persistentTokenId)
   Returns fresh access token
```

## Security Considerations

1. **State Token Validation**: State is validated against database
2. **User Authorization**: All endpoints require valid Bearer token
3. **Encryption**: Offline tokens are encrypted before storage
4. **Expiration**: Pending requests expire after 1 year
5. **Error Tracking**: Failed requests are marked in database

## Migration Steps

1. Run database migration:

   ```bash
   npm run db:migrate
   ```

2. Update environment variables (if needed):

   ```env
   KEYCLOAK_ISSUER=http://localhost:8081/auth/realms/SBO
   KEYCLOAK_CLIENT_ID=your-client-id
   KEYCLOAK_CLIENT_SECRET=your-client-secret
   NEXTAUTH_URL=http://localhost:3000
   ```

3. Configure Keycloak redirect URI:
   - Add `http://localhost:3000/api/auth/manager/offline-callback` to valid redirect URIs

## Testing

### 1. Request Consent URL

```bash
curl -X POST http://localhost:3000/api/auth/manager/offline-consent \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"taskId": "test-task-123"}'
```

### 2. Visit Consent URL

Open the returned `consentUrl` in a browser and grant consent.

### 3. Check Database

```sql
SELECT id, status, task_id, state_token
FROM token_vault
WHERE task_id = 'test-task-123';
```

### 4. Use Token

```bash
curl -X POST http://localhost:3000/api/auth/manager/access-token \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"persistentTokenId": "<id_from_step_1>"}'
```

## Future Enhancements

1. **Status Endpoint**: Add endpoint to check token status
2. **Webhook Support**: Notify external systems when token is ready
3. **Retry Logic**: Automatic retry for failed token exchanges
4. **Cleanup Job**: Remove old pending/failed requests
5. **Metrics**: Track consent success/failure rates
6. **Multi-Task Support**: Allow one token for multiple tasks

## Breaking Changes

None. This is an additive change that doesn't affect existing functionality.

## Backward Compatibility

- Existing tokens continue to work
- Old endpoints remain functional
- New columns are nullable
- Migration is non-destructive
