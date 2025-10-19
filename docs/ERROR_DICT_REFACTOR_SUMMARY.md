# Error Dictionary Refactoring Summary

## Overview

Refactored the error handling system to combine error codes and messages into a single unified dictionary format.

## Changes Made

### 1. New Combined Dictionary Format

**Before:**

```typescript
export const AuthManagerErrorCodeDict = {
  encryption_failed: "encryption_failed",
  // ...
} as const;

export const AuthManagerErrorMessageDict: Record<TAuthManagerCode, string> = {
  [AuthManagerErrorCodeDict.encryption_failed]: "failed to encrypt token",
  // ...
};
```

**After:**

```typescript
export const AuthManagerErrorDict = {
  encryption_failed: {
    code: "encryption_failed",
    message: "failed to encrypt token",
  },
  decryption_failed: {
    code: "decryption_failed",
    message: "failed to decrypt token",
  },
  // ... all error codes with their messages
} as const;
```

### 2. Updated Type Definition

```typescript
export type TAuthManagerCode = keyof typeof AuthManagerErrorDict;
```

### 3. Updated AuthManagerError Class

The class now uses the combined dictionary:

```typescript
constructor(code: TAuthManagerCode, metadata?: Omit<AuthManagerErrorMetadata, "code">) {
  const message = metadata?.originalError instanceof Error
    ? metadata.originalError.message
    : AuthManagerErrorDict[code].message;  // <-- Uses combined dict
  // ...
}

msg(): string {
  return AuthManagerErrorDict[this.code].message;  // <-- Uses combined dict
}
```

### 4. Backward Compatibility

Added backward compatibility exports so existing code continues to work:

```typescript
/**
 * @deprecated Use AuthManagerErrorDict with direct key access instead
 */
export const AuthManagerErrorCodeDict = {
  encryption_failed: "encryption_failed" as const,
  decryption_failed: "decryption_failed" as const,
  // ... all codes
};

/**
 * @deprecated Use AuthManagerErrorDict instead
 */
export const VaultErrorCodeDict = AuthManagerErrorCodeDict;

/**
 * @deprecated Use AuthManagerErrorDict instead
 */
export const AuthManagerErrorMessageDict = Object.fromEntries(
  Object.entries(AuthManagerErrorDict).map(([key, value]) => [
    key,
    value.message,
  ])
) as Record<TAuthManagerCode, string>;

/**
 * @deprecated Use AuthManagerErrorDict instead
 */
export const VaultErrorMessageDict = AuthManagerErrorMessageDict;

/**
 * @deprecated Use TAuthManagerCode instead
 */
export type VaultErrorCode = TAuthManagerCode;

/**
 * @deprecated Use AuthManagerError instead
 */
export const VaultError = AuthManagerError;
```

### 5. Updated Usage Pattern

**Old way (still works):**

```typescript
throw new AuthManagerError(AuthManagerErrorCodeDict.encryption_failed, {
  reason: "Something went wrong",
});
```

**New way (recommended):**

```typescript
throw new AuthManagerError("encryption_failed", {
  reason: "Something went wrong",
});
```

## Files Updated

### Core Files

- `src/lib/auth/vault-errors.ts` - Main refactoring
- `src/lib/auth/response.ts` - Updated to use new format
- `src/lib/auth/encryption.ts` - Updated to use string literals
- `src/lib/auth/keycloak-client.ts` - Updated to use string literals

### Files Using Backward Compatibility

These files still use the old `AuthManagerErrorCodeDict` but work through backward compatibility exports:

- `src/lib/auth/token-vault-postgres.ts`
- `src/lib/auth/token-vault-redis.ts`
- `src/app/api/auth/manager/*.ts` (all route files)

## Benefits

1. **Single Source of Truth**: Code and message are defined together
2. **Type Safety**: TypeScript ensures code and message are always in sync
3. **Easier Maintenance**: Add new errors in one place
4. **Better DX**: Autocomplete shows both code and message
5. **Backward Compatible**: Existing code continues to work
6. **Cleaner Usage**: Can use string literals directly

## Migration Guide

### For New Code

Use string literals directly:

```typescript
// ✅ Recommended
throw new AuthManagerError("encryption_failed", { ... });

// ❌ Old way (deprecated)
throw new AuthManagerError(AuthManagerErrorCodeDict.encryption_failed, { ... });
```

### For Existing Code

No changes required! The backward compatibility exports ensure all existing code continues to work.

### To Fully Migrate

1. Replace `AuthManagerErrorCodeDict.xxx` with string literal `"xxx"`
2. Remove `AuthManagerErrorCodeDict` from imports
3. Access messages via `AuthManagerErrorDict.xxx.message` if needed

## Example Usage

### Creating Errors

```typescript
// Simple error
throw new AuthManagerError("unauthorized");

// With metadata
throw new AuthManagerError("storage_error", {
  operation: "store",
  userId: "user-123",
  originalError: error,
});
```

### Accessing Error Info

```typescript
const errorInfo = AuthManagerErrorDict.encryption_failed;
console.log(errorInfo.code); // "encryption_failed"
console.log(errorInfo.message); // "failed to encrypt token"
```

### In Response Handlers

```typescript
const VAULT_ERROR_STATUS_MAP: Record<TAuthManagerCode, number> = {
  encryption_failed: StatusCodes.INTERNAL_SERVER_ERROR,
  decryption_failed: StatusCodes.INTERNAL_SERVER_ERROR,
  // ... direct key access
};
```

## Testing

All files compile successfully with no TypeScript errors. The refactoring maintains full backward compatibility while providing a cleaner API for new code.

## Next Steps

1. Gradually migrate existing code to use string literals
2. Remove deprecated imports over time
3. Consider adding JSDoc examples to error definitions
4. Add error code constants for commonly used errors
