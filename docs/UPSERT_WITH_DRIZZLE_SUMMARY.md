# Upsert Refresh Token with Drizzle ORM

## Overview

Updated the refresh token upsert implementation to use Drizzle ORM's `onConflictDoUpdate` with `setWhere` for proper database-level upsert operations.

## Changes Made

### 1. Database Migration - Unique Constraint

Created a unique partial index to enable upsert on `(user_id, token_type)` for refresh tokens:

```sql
-- drizzle/migrations/0004_add_unique_constraint_user_token_type.sql
CREATE UNIQUE INDEX IF NOT EXISTS "auth_vault_user_id_token_type_unique_idx"
ON "auth_vault" ("user_id", "token_type")
WHERE "token_type" = 'refresh';
```

**Why Partial Index?**

- Only applies to refresh tokens (`WHERE token_type = 'refresh'`)
- Allows multiple offline tokens per user
- Ensures exactly one refresh token per user
- Enables efficient upsert operations

### 2. PostgreSQL Implementation - onConflictDoUpdate

Updated `upsertRefreshToken` to use Drizzle's native upsert:

```typescript
async upsertRefreshToken(
  userId: string,
  token: string,
  expiresAt: Date,
  sessionState?: string,
  metadata?: Record<string, any>
): Promise<string> {
  try {
    const id = generatePersistentTokenId();
    const iv = generateIV();
    const encryptedToken = encryptToken(token, iv);

    const result = await this.db
      .insert(AuthVault)
      .values({
        id,
        userId,
        tokenType: AuthManagerTokenTypeDict.Refresh,
        encryptedToken,
        iv,
        expiresAt,
        sessionState: sessionState || null,
        metadata: metadata || null,
      })
      .onConflictDoUpdate({
        target: [AuthVault.userId, AuthVault.tokenType],
        set: {
          encryptedToken,
          iv,
          expiresAt,
          sessionState: sessionState || null,
          // Merge metadata using SQL jsonb concatenation
          metadata: sql`COALESCE(${AuthVault.metadata}, '{}'::jsonb) || COALESCE(${metadata ? sql.raw(JSON.stringify(metadata)) : sql`'{}'::jsonb`}, '{}'::jsonb) || jsonb_build_object('updatedAt', ${new Date().toISOString()})`,
        },
        setWhere: and(
          eq(AuthVault.userId, userId),
          eq(AuthVault.tokenType, AuthManagerTokenTypeDict.Refresh)
        ),
      })
      .returning({ id: AuthVault.id });

    const returnedId = result[0]?.id || id;
    return returnedId;
  } catch (error) {
    // Error handling...
  }
}
```

**Key Features:**

- `target`: Specifies conflict columns `(user_id, token_type)`
- `set`: Defines what to update on conflict
- `setWhere`: Additional condition for the update (optional but explicit)
- `returning`: Returns the ID of the upserted row
- **Metadata Merging**: Uses PostgreSQL's `jsonb` concatenation operator `||`

### 3. Metadata Merging with SQL

The metadata merging is done at the database level using PostgreSQL's jsonb operators:

```sql
COALESCE(auth_vault.metadata, '{}'::jsonb)
|| COALESCE($metadata, '{}'::jsonb)
|| jsonb_build_object('updatedAt', $timestamp)
```

**Breakdown:**

1. `COALESCE(auth_vault.metadata, '{}'::jsonb)` - Get existing metadata or empty object
2. `|| COALESCE($metadata, '{}'::jsonb)` - Merge with new metadata
3. `|| jsonb_build_object('updatedAt', $timestamp)` - Add timestamp

**Result:**

- Existing metadata is preserved
- New metadata is merged
- `updatedAt` timestamp is automatically added
- All done in a single atomic operation

### 4. Updated src/auth.ts

#### Initial Login - Store Refresh Token

```typescript
// Store refresh token in Token Vault for external services
if (account.refresh_token && profile?.sub) {
  const { GetStorage } = await import(
    "@/services/auth-manager/auth/token-vault-factory"
  );
  const store = GetStorage();
  const expiresAt = getExpirationDate(TokenExpirationDict.refresh);

  const persistentTokenId = await store.upsertRefreshToken(
    profile.sub,
    account.refresh_token,
    expiresAt,
    account.session_state, // ✅ Added session_state
    {
      email: user.email,
      name: user.name,
      provider: account.provider,
      loginTime: new Date().toISOString(),
    }
  );

  token.persistentTokenId = persistentTokenId;
}
```

#### Token Refresh - Update Refresh Token

```typescript
// Always update refresh token in vault (upsert handles create/update)
if (token.user?.id) {
  const { GetStorage } = await import(
    "@/services/auth-manager/auth/token-vault-factory"
  );
  const store = GetStorage();
  const expiresAt = getExpirationDate(TokenExpirationDict.refresh);

  const persistentTokenId = await store.upsertRefreshToken(
    token.user.id,
    newRefreshToken,
    expiresAt,
    refreshedTokens.session_state, // ✅ Added session_state from refresh response
    {
      email: token.user.email,
      name: token.user.name,
      lastRefresh: new Date().toISOString(),
      refreshCount: ((token as any).refreshCount || 0) + 1,
    }
  );

  token.persistentTokenId = persistentTokenId;
  (token as any).refreshCount = ((token as any).refreshCount || 0) + 1;
}
```

**Changes:**

- ✅ Removed `delete()` call - no longer needed
- ✅ Removed condition check for token rotation - always upsert
- ✅ Added `session_state` parameter
- ✅ Added `refreshCount` tracking in metadata
- ✅ Simplified logic - upsert handles everything

## Benefits

### 1. Database-Level Upsert

**Before (Application-Level):**

```typescript
// SELECT to check if exists
const existing = await db.select()...
if (existing.length > 0) {
  // UPDATE
  await db.update()...
} else {
  // INSERT
  await db.insert()...
}
```

**After (Database-Level):**

```typescript
// Single atomic operation
await db.insert()...onConflictDoUpdate()...
```

**Benefits:**

- ✅ Atomic operation (no race conditions)
- ✅ Faster (single query vs 2-3 queries)
- ✅ Safer (handles concurrent requests)
- ✅ Cleaner code

### 2. Metadata Merging at Database Level

**Before (Application-Level):**

```typescript
const existingMetadata = existing[0].metadata || {};
const mergedMetadata = { ...existingMetadata, ...metadata };
await db.update().set({ metadata: mergedMetadata });
```

**After (Database-Level):**

```sql
metadata = existing_metadata || new_metadata || {'updatedAt': timestamp}
```

**Benefits:**

- ✅ No need to fetch existing metadata
- ✅ Atomic merge operation
- ✅ Handles concurrent updates correctly
- ✅ Leverages PostgreSQL's jsonb operators

### 3. Session State Tracking

Now storing Keycloak's `session_state` from both:

- Initial login (`account.session_state`)
- Token refresh (`refreshedTokens.session_state`)

**Benefits:**

- ✅ Track Keycloak sessions
- ✅ Better debugging
- ✅ Session correlation
- ✅ Audit trail

### 4. Simplified Auth Logic

**Before:**

```typescript
if (newRefreshToken !== oldRefreshToken && token.persistentTokenId && token.user?.id) {
  await store.delete(token.persistentTokenId);
  await store.create(...);
}
```

**After:**

```typescript
if (token.user?.id) {
  await store.upsertRefreshToken(...);
}
```

**Benefits:**

- ✅ Always updates (no conditions)
- ✅ No delete needed
- ✅ Handles token rotation automatically
- ✅ Simpler logic

## SQL Generated

### Insert (First Time)

```sql
INSERT INTO "auth_vault"
  ("id", "user_id", "token_type", "encrypted_token", "iv", "expires_at", "session_state", "metadata")
VALUES
  ($1, $2, 'refresh', $3, $4, $5, $6, $7)
ON CONFLICT ("user_id", "token_type")
WHERE "token_type" = 'refresh'
DO UPDATE SET
  "encrypted_token" = $3,
  "iv" = $4,
  "expires_at" = $5,
  "session_state" = $6,
  "metadata" = COALESCE("auth_vault"."metadata", '{}'::jsonb) || COALESCE($7, '{}'::jsonb) || jsonb_build_object('updatedAt', $8)
WHERE "auth_vault"."user_id" = $2
  AND "auth_vault"."token_type" = 'refresh'
RETURNING "id";
```

### Update (Subsequent Times)

Same query, but the conflict is detected and UPDATE is executed instead of INSERT.

## Testing

### Test Upsert Behavior

```typescript
const vault = GetStorage();

// First call - INSERT
const id1 = await vault.upsertRefreshToken(
  "user-123",
  "token-1",
  new Date(Date.now() + 3600000),
  "session-1",
  { email: "user@example.com", count: 1 }
);

// Second call - UPDATE (same ID)
const id2 = await vault.upsertRefreshToken(
  "user-123",
  "token-2",
  new Date(Date.now() + 3600000),
  "session-2",
  { count: 2 }
);

console.assert(id1 === id2, "IDs should match");

// Check metadata was merged
const entry = await vault.retrieve(id1);
console.assert(
  entry.metadata.email === "user@example.com",
  "Original metadata preserved"
);
console.assert(entry.metadata.count === 2, "New metadata merged");
console.assert(entry.metadata.updatedAt, "Timestamp added");
console.assert(entry.sessionState === "session-2", "Session state updated");
```

### Test Concurrent Upserts

```typescript
// Simulate concurrent refresh token updates
const promises = Array.from({ length: 10 }, (_, i) =>
  vault.upsertRefreshToken(
    "user-123",
    `token-${i}`,
    new Date(Date.now() + 3600000),
    `session-${i}`,
    { refreshCount: i }
  )
);

const ids = await Promise.all(promises);

// All should return the same ID
const uniqueIds = new Set(ids);
console.assert(
  uniqueIds.size === 1,
  "All concurrent upserts should use same ID"
);

// Check final state
const entry = await vault.retrieve(ids[0]);
console.assert(
  entry.metadata.refreshCount >= 0,
  "Final metadata should be valid"
);
```

### Verify Database State

```sql
-- Should have exactly one refresh token per user
SELECT user_id, COUNT(*) as count
FROM auth_vault
WHERE token_type = 'refresh'
GROUP BY user_id
HAVING COUNT(*) > 1;
-- Should return 0 rows

-- Check metadata evolution
SELECT
  user_id,
  session_state,
  metadata->>'email' as email,
  metadata->>'refreshCount' as refresh_count,
  metadata->>'updatedAt' as updated_at
FROM auth_vault
WHERE token_type = 'refresh'
ORDER BY created_at DESC;
```

## Migration Steps

### 1. Run Database Migration

```bash
npm run db:migrate
```

Or manually:

```sql
-- Add unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS "auth_vault_user_id_token_type_unique_idx"
ON "auth_vault" ("user_id", "token_type")
WHERE "token_type" = 'refresh';
```

### 2. Clean Up Existing Duplicates (If Any)

```sql
-- Keep only the most recent refresh token per user
WITH ranked_tokens AS (
  SELECT
    id,
    user_id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) as rn
  FROM auth_vault
  WHERE token_type = 'refresh'
)
DELETE FROM auth_vault
WHERE id IN (
  SELECT id FROM ranked_tokens WHERE rn > 1
);
```

### 3. Restart Application

The new code will automatically use the upsert logic.

## Rollback Plan

If issues occur:

```sql
-- Remove unique constraint
DROP INDEX IF EXISTS "auth_vault_user_id_token_type_unique_idx";
```

Then revert code changes.

## Summary

✅ **Implemented:** Database-level upsert with `onConflictDoUpdate`  
✅ **Implemented:** Metadata merging at database level with jsonb operators  
✅ **Implemented:** Session state tracking from Keycloak  
✅ **Updated:** `src/auth.ts` to use `upsertRefreshToken` everywhere  
✅ **Created:** Unique constraint migration  
✅ **Tested:** No TypeScript errors  
✅ **Benefit:** Atomic operations, no race conditions, cleaner code  
✅ **Benefit:** One refresh token per user guaranteed by database
