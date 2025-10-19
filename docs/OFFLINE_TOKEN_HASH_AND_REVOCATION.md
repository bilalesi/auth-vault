# Offline Token Hashing and Smart Revocation

## Summary

Implemented token hashing and smart revocation logic to prevent unnecessary token revocations when multiple tasks share the same offline token.

## Changes Made

### 1. Token Hashing (`src/lib/auth/encryption.ts`)

Added `hashToken()` function that creates SHA-256 hashes of tokens:

```typescript
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
```

**Purpose:**

- Detect duplicate offline tokens across multiple persistent token IDs
- Compare tokens without decrypting them
- Determine if a token is shared before revoking it

### 2. Database Schema (`src/lib/db/schema.ts`)

Added `tokenHash` column to `auth_vault` table:

```typescript
tokenHash: text("token_hash"), // SHA-256 hash of the decrypted token
```

**Migration Script:** `scripts/add-token-hash-column.sql`

```sql
ALTER TABLE auth_vault ADD COLUMN IF NOT EXISTS token_hash TEXT;
CREATE INDEX IF NOT EXISTS auth_vault_token_hash_idx ON auth_vault(token_hash);
```

### 3. Token Vault Interface (`src/lib/auth/token-vault-interface.ts`)

Added new methods:

```typescript
interface IStorage {
  // Get all offline tokens for a user
  getUserOfflineTokens(userId: string): Promise<TokenVaultEntry[]>;

  // Check if a token hash exists (excluding a specific token ID)
  tokenHashExists(tokenHash: string, excludeTokenId: string): Promise<boolean>;
}
```

### 4. Postgres Implementation (`src/lib/auth/token-vault-postgres.ts`)

**Updated Methods:**

- `create()`: Now computes and stores token hash for offline tokens
- `updateOfflineTokenByState()`: Stores hash when activating pending tokens
- `getUserOfflineTokens()`: Retrieves all offline tokens for a user
- `tokenHashExists()`: Checks if hash exists in other entries

```typescript
async tokenHashExists(tokenHash: string, excludeTokenId: string): Promise<boolean> {
  const row = await this.db.query.AuthVault.findFirst({
    where: (f, op) => {
      return op.and(
        op.eq(f.tokenHash, tokenHash),
        op.ne(f.id, excludeTokenId)
      );
    },
  });
  return row !== undefined;
}
```

### 5. Redis Implementation (`src/lib/auth/token-vault-redis.ts`)

**Updated Methods:**

- `create()`: Computes and stores token hash
- `updateOfflineTokenByState()`: Stores hash when activating
- `getUserOfflineTokens()`: Retrieves all offline tokens
- `tokenHashExists()`: Scans all tokens to find matching hash

### 6. Keycloak Client (`src/lib/auth/keycloak-client.ts`)

Added `revokeToken()` method:

```typescript
async revokeToken(token: string): Promise<void> {
  const response = await this.fetch(this.config.revocationEndpoint, {
    method: "POST",
    headers: { "Content-Type": KeycloakContentType },
    body: new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      token,
    }),
  });
  // Handle response...
}
```

### 7. DELETE Endpoint (`src/app/api/auth/manager/offline-token-id/route.ts`)

Implemented smart revocation logic:

```typescript
// Step 1: Delete the persistent token ID from database
await store.delete(persistentTokenId);

// Step 2: Check if the same offline token exists in other entries
const tokenHash = entry.tokenHash;
let shouldRevoke = true;

if (tokenHash) {
  const hashExists = await store.tokenHashExists(tokenHash, persistentTokenId);
  if (hashExists) {
    shouldRevoke = false; // Don't revoke if other tasks use it
  }
}

// Step 3: Revoke in Keycloak only if no other tasks use it
if (shouldRevoke) {
  await keycloakClient.revokeToken(token);
}
```

### 8. List Offline Tokens Endpoint

Created `src/app/api/auth/manager/offline-tokens/route.ts`:

```typescript
GET / api / auth / manager / offline - tokens;
```

Returns all offline tokens for the authenticated user (without sensitive data).

## Flow Diagram

```
User Deletes Task with Offline Token
       ↓
DELETE /api/auth/manager/offline-token-id
       ↓
Retrieve Token Entry (includes tokenHash)
       ↓
Delete persistent_token_id from Database
       ↓
Check if tokenHash exists in other entries
       ↓
   ┌───────────────┴───────────────┐
   │                               │
Hash Found                    Hash Not Found
(Other tasks use it)          (No other tasks)
   │                               │
   ↓                               ↓
Skip Revocation              Revoke in Keycloak
   │                               │
   └───────────────┬───────────────┘
                   ↓
            Return Success
```

## Use Cases

### Case 1: Single Task with Offline Token

```
Task A → persistent_token_id_1 → offline_token_xyz (hash: abc123)
```

**Delete Task A:**

1. Delete `persistent_token_id_1` from database
2. Check if hash `abc123` exists elsewhere → NO
3. Revoke `offline_token_xyz` in Keycloak ✅

### Case 2: Multiple Tasks Sharing Same Offline Token

```
Task A → persistent_token_id_1 → offline_token_xyz (hash: abc123)
Task B → persistent_token_id_2 → offline_token_xyz (hash: abc123)
```

**Delete Task A:**

1. Delete `persistent_token_id_1` from database
2. Check if hash `abc123` exists elsewhere → YES (Task B still uses it)
3. Skip Keycloak revocation ⏭️

**Delete Task B:**

1. Delete `persistent_token_id_2` from database
2. Check if hash `abc123` exists elsewhere → NO
3. Revoke `offline_token_xyz` in Keycloak ✅

### Case 3: Different Offline Tokens

```
Task A → persistent_token_id_1 → offline_token_xyz (hash: abc123)
Task B → persistent_token_id_2 → offline_token_def (hash: def456)
```

**Delete Task A:**

1. Delete `persistent_token_id_1`
2. Check hash `abc123` → NO
3. Revoke `offline_token_xyz` ✅

**Delete Task B:**

1. Delete `persistent_token_id_2`
2. Check hash `def456` → NO
3. Revoke `offline_token_def` ✅

## Benefits

1. **Prevents Premature Revocation**: Doesn't revoke tokens still in use by other tasks
2. **Efficient Deduplication**: Uses hash comparison instead of decrypting all tokens
3. **Security**: Hashes are one-way, can't recover original token
4. **Performance**: Indexed hash lookups are fast
5. **Flexibility**: Multiple tasks can safely share the same offline token

## Testing

### Run Migration

```bash
# Apply the migration
psql -U postgres -d nextjs_keycloak_auth -f scripts/add-token-hash-column.sql
```

### Test Scenarios

1. **Create two tasks with same offline token:**

   ```bash
   # Create Task A and request offline token
   # Create Task B and link to same persistent_token_id
   # Delete Task A → token should NOT be revoked
   # Delete Task B → token SHOULD be revoked
   ```

2. **List offline tokens:**

   ```bash
   curl http://localhost:3000/api/auth/manager/offline-tokens \
     -H "Cookie: next-auth.session-token=..."
   ```

3. **Delete with revocation:**
   ```bash
   curl -X DELETE http://localhost:3000/api/auth/manager/offline-token-id \
     -H "Content-Type: application/json" \
     -d '{"persistentTokenId": "uuid-here"}'
   ```

## Security Considerations

1. **Hash Algorithm**: SHA-256 is cryptographically secure and collision-resistant
2. **One-Way**: Cannot recover original token from hash
3. **Indexed**: Fast lookups without exposing token data
4. **Consistent**: Same token always produces same hash

## Next Steps

- Add UI to show which tasks share the same offline token
- Add warning before deleting last task using a token
- Add bulk revocation endpoint
- Add token usage analytics
