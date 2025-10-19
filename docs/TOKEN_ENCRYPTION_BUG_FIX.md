# Token Encryption Bug Fix

## Issue

When offline tokens were stored in the vault after consent callback, they were being saved as **plain text JWT strings** instead of **encrypted hex strings**. This caused decryption failures when trying to retrieve and use the tokens.

## Root Cause

Both `token-vault-postgres.ts` and `token-vault-redis.ts` had a bug in the `updateOfflineTokenByState` method where the return statement was returning the **plain token** instead of the **encrypted token**.

### Bug Location

#### Postgres Implementation (`src/lib/auth/token-vault-postgres.ts`)

```typescript
// ❌ BEFORE (Line ~270)
return {
  ...
  encryptedToken: token,  // Returns plain token!
  iv: iv || row.iv,
  ...
};

// ✅ AFTER
return {
  ...
  encryptedToken: encryptedToken || row.encryptedToken,  // Returns encrypted token
  iv: iv || row.iv,
  ...
};
```

#### Redis Implementation (`src/lib/auth/token-vault-redis.ts`)

```typescript
// ❌ BEFORE (Line ~365)
return {
  ...
  encryptedToken: token,  // Returns plain token!
  iv: iv || entry.iv,
  ...
};

// ✅ AFTER
return {
  ...
  encryptedToken: encryptedToken || entry.encryptedToken,  // Returns encrypted token
  iv: iv || entry.iv,
  ...
};
```

## What Was Happening

1. User grants consent in Keycloak
2. Callback receives offline token (JWT string)
3. `updateOfflineTokenByState` is called:
   - ✅ Token is encrypted: `encryptedToken = encryptToken(token, iv)`
   - ✅ Encrypted token is stored in database
   - ❌ **But return value has plain token**: `encryptedToken: token`
4. Later, when retrieving token:
   - Database has encrypted hex string
   - But the method returned plain JWT
   - Decryption fails because it tries to decrypt a JWT string

## Error Symptoms

```
Error [AuthManagerError]: failed to decrypt token
  at decryptToken (src/lib/auth/encryption.ts:362:13)

Reason: Invalid auth tag length - data may be corrupted
Expected: 16 bytes
Actual: 0 bytes
```

The auth tag was empty because the "encrypted" data was actually a JWT string, not hex-encoded encrypted data.

## The Fix

Changed both implementations to return the **encrypted token** that was just created, not the plain token parameter.

```typescript
// Use the encrypted version
encryptedToken: encryptedToken || row.encryptedToken;
// Instead of the plain parameter
encryptedToken: token;
```

## Impact

- **Database**: Already storing encrypted tokens correctly ✅
- **Return Value**: Now returns encrypted token correctly ✅
- **Retrieval**: Decryption will now work properly ✅

## Testing

After this fix, the flow should work:

1. Grant consent → Token encrypted and stored
2. Execute task → Retrieve encrypted token
3. Call `/api/auth/manager/access-token` → Decrypt token successfully
4. Exchange refresh token for access token → Success!

## Prevention

This bug highlights the importance of:

1. Consistent naming (don't reuse parameter names for transformed values)
2. Unit tests for encryption/decryption round-trips
3. Integration tests that verify the full token lifecycle

## Related Files

- `src/lib/auth/token-vault-postgres.ts` - Fixed
- `src/lib/auth/token-vault-redis.ts` - Fixed
- `src/lib/auth/encryption.ts` - Decryption logic (no changes needed)
- `src/app/api/auth/manager/offline-callback/route.ts` - Calls updateOfflineTokenByState
- `src/app/api/auth/manager/access-token/route.ts` - Retrieves and decrypts tokens
