# retrieveBySessionState API Update

## Summary

Updated `retrieveBySessionState` to follow the same API pattern as `retrieveDuplicateTokenHash` by adding an `excludeTokenId` parameter. This simplifies the revoke logic by eliminating the need to check `if (tokensWithSameSession.length === 1)`.

## Changes Made

### 1. Interface Update

**Before**:

```typescript
retrieveBySessionState(sessionState: string): Promise<TokenVaultEntry[]>
```

**After**:

```typescript
retrieveBySessionState(
  sessionState: string,
  excludeTokenId: string
): Promise<TokenVaultEntry[]>
```

### 2. Postgres Implementation

Added `excludeTokenId` filter:

```typescript
where: (f, op) =>
  op.and(
    op.eq(f.sessionState, sessionState),
    op.ne(f.id, excludeTokenId) // ← New: Exclude this token
  );
```

### 3. Redis Implementation

Added `excludeTokenId` filter:

```typescript
if (
  entry.sessionState === sessionState &&
  entry.id !== excludeTokenId // ← New: Exclude this token
) {
  entries.push(entry);
}
```

### 4. Revoke Endpoint Logic

**Before**:

```typescript
// Find all tokens with the same session_state
const tokensWithSameSession = await store.retrieveBySessionState(
  entry.sessionState
);

// Delete this token
await store.delete(persistentTokenId);

// Check if this was the last token
if (tokensWithSameSession.length === 1) {
  await keycloakClient.revokeSession(entry.sessionState);
}

return {
  tokensWithSameSession: tokensWithSameSession.length - 1, // Subtract 1
};
```

**After**:

```typescript
// Find all OTHER tokens with the same session_state (excluding this one)
const otherTokensWithSameSession = await store.retrieveBySessionState(
  entry.sessionState,
  persistentTokenId // ← Exclude this token
);

// Delete this token
await store.delete(persistentTokenId);

// Check if no other tokens exist
if (otherTokensWithSameSession.length === 0) {
  await keycloakClient.revokeSession(entry.sessionState);
}

return {
  tokensWithSameSession: otherTokensWithSameSession.length, // No subtraction needed
};
```

## Benefits

### 1. Cleaner Logic

- No need to check `if (length === 1)` - just check `if (length === 0)`
- No need to subtract 1 from the count in the response
- More intuitive: "Are there OTHER tokens?" vs "Is this the LAST token?"

### 2. Consistent API

- Follows the same pattern as `retrieveDuplicateTokenHash`
- Both methods now exclude a specific token ID
- Easier to understand and maintain

### 3. Fewer Edge Cases

- Eliminates the possibility of off-by-one errors
- The query result directly represents "other tokens"
- No mental math required to interpret the count

## Comparison

### Old Flow

```
1. Query: Get ALL tokens with session_state
2. Result: [Token A, Token B, Token C]  (length = 3)
3. Delete: Token A
4. Check: Was Token A the last? (length === 1? No, it was 3)
5. Logic: 3 - 1 = 2 other tokens remain
6. Decision: Don't revoke (2 > 0)
```

### New Flow

```
1. Query: Get OTHER tokens with session_state (exclude Token A)
2. Result: [Token B, Token C]  (length = 2)
3. Delete: Token A
4. Check: Are there other tokens? (length === 0? No, it's 2)
5. Logic: 2 other tokens remain (no math needed)
6. Decision: Don't revoke (2 > 0)
```

## Testing

The behavior remains exactly the same, just with cleaner code:

```bash
# Scenario: 3 tokens with same session_state

# Revoke Token 1
# Old: tokensWithSameSession.length = 3, check if === 1 (false), return 3-1=2
# New: otherTokensWithSameSession.length = 2, check if === 0 (false), return 2
# Result: Session NOT revoked ✓

# Revoke Token 2
# Old: tokensWithSameSession.length = 2, check if === 1 (false), return 2-1=1
# New: otherTokensWithSameSession.length = 1, check if === 0 (false), return 1
# Result: Session NOT revoked ✓

# Revoke Token 3
# Old: tokensWithSameSession.length = 1, check if === 1 (true), return 1-1=0
# New: otherTokensWithSameSession.length = 0, check if === 0 (true), return 0
# Result: Session REVOKED ✓
```

## Code Quality Improvements

1. **Variable Naming**: `otherTokensWithSameSession` is more descriptive than `tokensWithSameSession`
2. **Logic Clarity**: `if (length === 0)` is clearer than `if (length === 1)`
3. **No Arithmetic**: Response value is direct, no need for `length - 1`
4. **Consistency**: Matches the pattern of `retrieveDuplicateTokenHash`

## Migration Notes

- No database migration needed
- No breaking changes to external APIs
- Internal method signature changed (added parameter)
- All implementations updated (Postgres, Redis)
- Tests should verify the same behavior with new implementation
