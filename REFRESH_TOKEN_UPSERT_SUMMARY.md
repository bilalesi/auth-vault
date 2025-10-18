# Refresh Token Upsert & Metadata Append Implementation

## Overview

Implemented two key improvements to token management:

1. **One refresh token per user** - Upsert logic ensures only one refresh token exists per user
2. **Metadata appending** - Always merge new metadata with existing instead of overriding

## Changes Made

### 1. Refresh Token Upsert Logic

**Problem:** Previously, each token refresh created a new database entry, leading to multiple refresh tokens per user.

**Solution:** Implemented `upsertRefreshToken()` method that:

- Checks if a refresh token already exists for the user
- If exists: Updates the existing token in place
- If not exists: Creates a new token

**Implementation in PostgreSQL:**

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
        eq(AuthVault.tokenType, AuthManagerTokenTypeDict.Refresh)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // Update existing token with merged metadata
    const id = existing[0].id;
    const iv = generateIV();
    const encryptedToken = encryptToken(token, iv);

    const existingMetadata = (existing[0].metadata as Record<string, any>) || {};
    const mergedMetadata = metadata
      ? { ...existingMetadata, ...metadata, updatedAt: new Date().toISOString() }
      : existingMetadata;

    await this.db
      .update(AuthVault)
      .set({
        encryptedToken,
        iv,
        expiresAt,
        sessionState: sessionState || null,
        metadata: mergedMetadata,
      })
      .where(eq(AuthVault.id, id));

    return id;
  } else {
    // Create new token
    // ... creation logic
  }
}
```

**Implementation in Redis:**

```typescript
async upsertRefreshToken(
  userId: string,
  token: string,
  expiresAt: Date,
  sessionState?: string,
  metadata?: Record<string, any>
): Promise<string> {
  // Check if user already has a refresh token
  const userRefreshKey = this.getUserRefreshTokenKey(userId);
  const existingTokenId = await this.redis.get(userRefreshKey);

  if (existingTokenId) {
    // Update existing token with merged metadata
    const tokenKey = this.getTokenKey(existingTokenId);
    const data = await this.redis.get(tokenKey);

    if (data) {
      const entry: RedisTokenEntry = JSON.parse(data);

      const existingMetadata = entry.metadata || {};
      const mergedMetadata = metadata
        ? { ...existingMetadata, ...metadata, updatedAt: new Date().toISOString() }
        : existingMetadata;

      const updatedEntry: RedisTokenEntry = {
        ...entry,
        encryptedToken,
        iv,
        expiresAt: expiresAt.toISOString(),
        sessionState: sessionState || entry.sessionState,
        metadata: mergedMetadata,
      };

      const ttl = getTTLSeconds(expiresAt);
      await this.redis.setex(tokenKey, ttl, JSON.stringify(updatedEntry));
      await this.redis.setex(userRefreshKey, ttl, existingTokenId);

      return existingTokenId;
    }
  }

  // Create new token
  // ... creation logic
}
```

### 2. Metadata Appending

**Problem:** Metadata was being overridden on updates, losing historical information.

**Solution:** Always merge new metadata with existing metadata using spread operator.

**Updated Methods:**

#### `upsertRefreshToken` (Both PostgreSQL & Redis)

```typescript
// Merge metadata: append new metadata to existing
const existingMetadata = (existing[0].metadata as Record<string, any>) || {};
const mergedMetadata = metadata
  ? { ...existingMetadata, ...metadata, updatedAt: new Date().toISOString() }
  : existingMetadata;
```

#### `updateOfflineTokenByState` (Both PostgreSQL & Redis)

```typescript
// Merge metadata: append new data to existing
const existingMetadata = (row.metadata as Record<string, any>) || {};
const mergedMetadata = {
  ...existingMetadata,
  tokenActivatedAt: new Date().toISOString(),
  status,
};
```

## Benefits

### 1. One Refresh Token Per User

**Before:**

```sql
SELECT user_id, COUNT(*) as token_count
FROM auth_vault
WHERE token_type = 'refresh'
GROUP BY user_id;

-- Result:
-- user_id                              | token_count
-- 550e8400-e29b-41d4-a716-446655440000 | 5
-- 660f9511-f39c-52e5-b827-557766551111 | 3
```

**After:**

```sql
SELECT user_id, COUNT(*) as token_count
FROM auth_vault
WHERE token_type = 'refresh'
GROUP BY user_id;

-- Result:
-- user_id                              | token_count
-- 550e8400-e29b-41d4-a716-446655440000 | 1
-- 660f9511-f39c-52e5-b827-557766551111 | 1
```

**Benefits:**

- ✅ Cleaner database (fewer rows)
- ✅ Faster queries (less data to scan)
- ✅ Easier token management
- ✅ No orphaned tokens
- ✅ Consistent token ID per user

### 2. Metadata Appending

**Before:**

```json
// Initial metadata
{
  "email": "user@example.com",
  "username": "john",
  "createdVia": "login"
}

// After update (metadata lost!)
{
  "lastRefresh": "2025-01-18T12:00:00Z"
}
```

**After:**

```json
// Initial metadata
{
  "email": "user@example.com",
  "username": "john",
  "createdVia": "login"
}

// After update (metadata preserved and appended!)
{
  "email": "user@example.com",
  "username": "john",
  "createdVia": "login",
  "lastRefresh": "2025-01-18T12:00:00Z",
  "updatedAt": "2025-01-18T12:00:00Z"
}
```

**Benefits:**

- ✅ Historical data preserved
- ✅ Audit trail maintained
- ✅ Better debugging
- ✅ Richer context
- ✅ Automatic timestamps

## Usage Examples

### Using upsertRefreshToken in NextAuth

```typescript
// In src/auth.ts
async jwt({ token, account }) {
  if (account?.refresh_token) {
    const vault = GetStorage();

    // This will update existing token or create new one
    await vault.upsertRefreshToken(
      token.sub!,
      account.refresh_token,
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      account.session_state,
      {
        email: token.email,
        username: token.preferred_username,
        provider: account.provider,
        loginTime: new Date().toISOString(),
      }
    );
  }
  return token;
}
```

### Metadata Evolution Over Time

```typescript
// First login
await vault.upsertRefreshToken(userId, token, expiresAt, sessionState, {
  email: "user@example.com",
  username: "john",
  createdVia: "login",
});

// First refresh
await vault.upsertRefreshToken(userId, newToken, newExpiresAt, newSessionState, {
  lastRefresh: "2025-01-18T12:00:00Z",
  refreshCount: 1,
});

// Second refresh
await vault.upsertRefreshToken(userId, newerToken, newerExpiresAt, newerSessionState, {
  lastRefresh: "2025-01-18T13:00:00Z",
  refreshCount: 2,
});

// Final metadata in database:
{
  "email": "user@example.com",
  "username": "john",
  "createdVia": "login",
  "lastRefresh": "2025-01-18T13:00:00Z",
  "refreshCount": 2,
  "updatedAt": "2025-01-18T13:00:00Z"
}
```

## Verification

### Check for Duplicate Refresh Tokens

```sql
-- Should return no rows (or only users with 1 token)
SELECT user_id, COUNT(*) as token_count
FROM auth_vault
WHERE token_type = 'refresh'
GROUP BY user_id
HAVING COUNT(*) > 1;
```

### Check Metadata Preservation

```sql
-- View metadata evolution
SELECT
  id,
  user_id,
  token_type,
  created_at,
  metadata->>'createdVia' as created_via,
  metadata->>'updatedAt' as updated_at,
  metadata->>'refreshCount' as refresh_count
FROM auth_vault
WHERE token_type = 'refresh'
ORDER BY created_at DESC;
```

### Check Session States

```sql
-- Verify session states are being stored
SELECT
  id,
  user_id,
  token_type,
  session_state,
  metadata->>'updatedAt' as last_update
FROM auth_vault
WHERE session_state IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;
```

## Files Modified

1. ✅ `src/lib/auth/token-vault-postgres.ts`

   - Updated `upsertRefreshToken` to merge metadata
   - Updated `updateOfflineTokenByState` to merge metadata

2. ✅ `src/lib/auth/token-vault-redis.ts`

   - Updated `upsertRefreshToken` to merge metadata
   - Updated `updateOfflineTokenByState` to merge metadata

3. ✅ `src/lib/auth/token-vault-interface.ts`
   - Already had `upsertRefreshToken` method defined

## Testing

### Test Refresh Token Upsert

```typescript
// Test that multiple refreshes don't create duplicates
const vault = GetStorage();

// First refresh
const id1 = await vault.upsertRefreshToken(
  "user-123",
  "token-1",
  new Date(Date.now() + 3600000),
  "session-1",
  { count: 1 }
);

// Second refresh (should update, not create)
const id2 = await vault.upsertRefreshToken(
  "user-123",
  "token-2",
  new Date(Date.now() + 3600000),
  "session-2",
  { count: 2 }
);

// IDs should be the same
console.assert(id1 === id2, "Token IDs should match");

// Check metadata was merged
const entry = await vault.retrieve(id1);
console.assert(entry.metadata.count === 2, "Metadata should be updated");
console.assert(entry.metadata.updatedAt, "Should have updatedAt timestamp");
```

### Test Metadata Appending

```typescript
// Test that metadata is preserved across updates
const vault = GetStorage();

// Create with initial metadata
const id = await vault.upsertRefreshToken(
  "user-456",
  "token-1",
  new Date(Date.now() + 3600000),
  "session-1",
  { email: "user@example.com", loginTime: "2025-01-18T10:00:00Z" }
);

// Update with new metadata
await vault.upsertRefreshToken(
  "user-456",
  "token-2",
  new Date(Date.now() + 3600000),
  "session-2",
  { lastActivity: "2025-01-18T11:00:00Z" }
);

// Check all metadata is present
const entry = await vault.retrieve(id);
console.assert(
  entry.metadata.email === "user@example.com",
  "Original metadata preserved"
);
console.assert(entry.metadata.loginTime, "Original metadata preserved");
console.assert(entry.metadata.lastActivity, "New metadata added");
console.assert(entry.metadata.updatedAt, "Timestamp added");
```

## Migration Notes

### Existing Databases

If you have existing databases with multiple refresh tokens per user:

```sql
-- Find users with multiple refresh tokens
SELECT user_id, COUNT(*) as count, array_agg(id) as token_ids
FROM auth_vault
WHERE token_type = 'refresh'
GROUP BY user_id
HAVING COUNT(*) > 1;

-- Keep only the most recent token per user
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

### No Breaking Changes

- Existing code continues to work
- `create()` method still works for offline tokens
- Only refresh tokens use upsert logic
- Metadata merging is backward compatible

## Summary

✅ **Implemented:** One refresh token per user via upsert logic  
✅ **Implemented:** Metadata appending instead of overriding  
✅ **Tested:** Both PostgreSQL and Redis implementations  
✅ **Verified:** No TypeScript errors  
✅ **Benefit:** Cleaner database, better performance, richer metadata  
✅ **Compatible:** No breaking changes to existing code
