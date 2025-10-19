# State Token to Ack State Migration Guide

## Overview

This document outlines the migration from `stateToken` to `ackState` and the addition of `sessionState` field.

## Changes Summary

### 1. Database Schema Changes

**Renamed Column:**

- `state_token` → `ack_state`

**New Column:**

- `session_state` - Stores Keycloak's session state from token responses

**Migration SQL:**

```sql
-- Rename state_token to ack_state
ALTER TABLE "auth_vault" RENAME COLUMN "state_token" TO "ack_state";

-- Add session_state column
ALTER TABLE "auth_vault" ADD COLUMN "session_state" TEXT;

-- Drop old index
DROP INDEX IF EXISTS "auth_vault_state_token_idx";

-- Create new indexes
CREATE INDEX IF NOT EXISTS "auth_vault_ack_state_idx" ON "auth_vault" ("ack_state");
CREATE INDEX IF NOT EXISTS "auth_vault_session_state_idx" ON "auth_vault" ("session_state");
```

### 2. Interface Changes

**TokenVaultEntry:**

```typescript
// OLD
interface TokenVaultEntry {
  stateToken?: string;
}

// NEW
interface TokenVaultEntry {
  ackState?: string; // Renamed from stateToken
  sessionState?: string; // New field
}
```

**IStorage Methods:**

```typescript
// OLD
getByStateToken(stateToken: string): Promise<TokenVaultEntry | null>;
updateStateToken(tokenId: string, stateToken: string): Promise<void>;
updateOfflineTokenByState(stateToken: string, token: string | null, status: OfflineTokenStatus): Promise<TokenVaultEntry | null>;

// NEW
getByAckState(ackState: string): Promise<TokenVaultEntry | null>;
updateAckState(tokenId: string, ackState: string): Promise<void>;
updateOfflineTokenByState(ackState: string, token: string | null, status: OfflineTokenStatus, sessionState?: string): Promise<TokenVaultEntry | null>;

// NEW METHOD
upsertRefreshToken(userId: string, token: string, expiresAt: Date, sessionState?: string, metadata?: Record<string, any>): Promise<string>;
```

### 3. Refresh Token Upsert Logic

**Problem:** Currently, refresh tokens create new entries on each refresh, leading to multiple tokens per user.

**Solution:** Implement `upsertRefreshToken()` method that:

1. Checks if a refresh token exists for the user
2. If exists: Updates the existing token in place
3. If not exists: Creates a new token

**Implementation:**

```typescript
async upsertRefreshToken(
  userId: string,
  token: string,
  expiresAt: Date,
  sessionState?: string,
  metadata?: Record<string, any>
): Promise<string> {
  // Find existing refresh token for user
  const existing = await this.db
    .select()
    .from(AuthVault)
    .where(
      and(
        eq(AuthVault.userId, userId),
        eq(AuthVault.tokenType, "refresh")
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // Update existing token
    const id = existing[0].id;
    const iv = generateIV();
    const encryptedToken = encryptToken(token, iv);

    await this.db
      .update(AuthVault)
      .set({
        encryptedToken,
        iv,
        expiresAt,
        sessionState,
        metadata: metadata || null,
      })
      .where(eq(AuthVault.id, id));

    return id;
  } else {
    // Create new token
    return await this.create(userId, token, "refresh", expiresAt, metadata);
  }
}
```

### 4. Session State Storage

**When to Store:**

- During initial login (refresh token)
- After token refresh (updated refresh token)
- After offline token exchange

**Keycloak Response:**

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "session_state": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**Storage:**

```typescript
await vault.upsertRefreshToken(
  userId,
  tokenResponse.refresh_token,
  expiresAt,
  tokenResponse.session_state, // Store this
  metadata
);
```

## Files That Need Updates

### Critical Files (Must Update):

1. ✅ `src/lib/db/schema.ts` - Schema definition
2. ✅ `src/lib/auth/token-vault-interface.ts` - Interface definition
3. ⏳ `src/lib/auth/token-vault-postgres.ts` - PostgreSQL implementation
4. ⏳ `src/lib/auth/token-vault-redis.ts` - Redis implementation
5. ⏳ `src/app/api/auth/manager/offline-callback/route.ts` - Uses getByStateToken
6. ⏳ `src/app/api/auth/manager/offline-consent/route.ts` - Uses updateStateToken
7. ⏳ `src/auth.ts` - NextAuth callbacks (store refresh tokens)

### Supporting Files:

8. `src/lib/auth/state-token.ts` - No changes needed (still generates state tokens)
9. `src/app/api/tasks/[taskId]/execute/route.ts` - May reference stateToken
10. Migration files

## Implementation Steps

### Step 1: Run Database Migration

```bash
npm run db:migrate
# or
psql -d your_db -f drizzle/migrations/0003_add_session_state_rename_state_token.sql
```

### Step 2: Update PostgreSQL Implementation

Replace all occurrences:

- `stateToken` → `ackState`
- `getByStateToken` → `getByAckState`
- `updateStateToken` → `updateAckState`
- Add `sessionState` parameter to `updateOfflineTokenByState`
- Implement `upsertRefreshToken` method

### Step 3: Update Redis Implementation

Same replacements as PostgreSQL.

### Step 4: Update API Routes

- `offline-callback/route.ts`: Use `getByAckState` instead of `getByStateToken`
- `offline-consent/route.ts`: Use `updateAckState` instead of `updateStateToken`

### Step 5: Update NextAuth Callbacks

In `src/auth.ts`, update the JWT callback to use `upsertRefreshToken`:

```typescript
async jwt({ token, account }) {
  if (account?.refresh_token) {
    const vault = GetStorage();
    await vault.upsertRefreshToken(
      token.sub!,
      account.refresh_token,
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      account.session_state,  // Add this
      {
        email: token.email,
        username: token.preferred_username,
      }
    );
  }
  return token;
}
```

### Step 6: Test

1. Test refresh token upsert (should update, not create new)
2. Test offline token flow with ackState
3. Verify sessionState is stored
4. Check database for duplicate refresh tokens (should be none)

## Verification Queries

### Check for Duplicate Refresh Tokens:

```sql
SELECT user_id, COUNT(*) as token_count
FROM auth_vault
WHERE token_type = 'refresh'
GROUP BY user_id
HAVING COUNT(*) > 1;
```

### Check Session States:

```sql
SELECT id, user_id, token_type, session_state, ack_state
FROM auth_vault
WHERE session_state IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;
```

### Check Ack States:

```sql
SELECT id, task_id, status, ack_state
FROM auth_vault
WHERE ack_state IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;
```

## Rollback Plan

If issues occur:

```sql
-- Rename back
ALTER TABLE "auth_vault" RENAME COLUMN "ack_state" TO "state_token";

-- Remove session_state
ALTER TABLE "auth_vault" DROP COLUMN "session_state";

-- Restore old index
DROP INDEX IF EXISTS "auth_vault_ack_state_idx";
DROP INDEX IF EXISTS "auth_vault_session_state_idx";
CREATE INDEX "auth_vault_state_token_idx" ON "auth_vault" ("state_token");
```

## Benefits

1. **Clearer Naming**: `ackState` better describes its purpose (acknowledgment state for OAuth flow)
2. **Session Tracking**: `sessionState` enables better session management and debugging
3. **No Duplicates**: `upsertRefreshToken` ensures one refresh token per user
4. **Better Performance**: Fewer database rows, faster queries
5. **Keycloak Alignment**: Matches Keycloak's session_state field

## Notes

- The `state-token.ts` utility doesn't need changes - it still generates state tokens
- The state token is still used in OAuth flow, just stored as `ackState` in DB
- Session state is different from OAuth state - it's Keycloak's session identifier
- Refresh tokens should always be upserted, never duplicated
- Offline tokens can have multiple entries per user (one per task)
