# Logger Migration Progress

## Overview

Migrating all console.log/error/warn statements to use the structured Pino logger.

## Pattern

### Before

```typescript
console.log("Token created:", tokenId);
console.error("Error creating token:", error);
```

### After

```typescript
import { info, error as logError, AuthLogEventDict } from "@/lib/logger";

info(AuthLogEventDict.tokenCreated, {
  component: "TokenVault",
  tokenId,
  userId,
});

logError(
  AuthLogEventDict.vaultError,
  {
    component: "TokenVault",
    operation: "create",
    userId,
  },
  error
);
```

## Files Updated

### ✅ Completed

1. `src/auth.ts` - NextAuth callbacks
2. `src/lib/auth/keycloak-client.ts` - Partial (refreshAccessToken, requestOfflineToken, first revokeToken)
3. `src/lib/auth/token-vault-postgres.ts` - Partial (upsertRefreshToken)

### 🔄 In Progress

4. `src/lib/auth/keycloak-client.ts` - Remaining methods
5. `src/lib/auth/token-vault-postgres.ts` - Remaining methods
6. `src/lib/auth/token-vault-redis.ts`

### ⏳ Pending

7. `src/app/api/auth/manager/revoke-offline-token/route.ts`
8. `src/app/api/tasks/route.ts`
9. `src/app/api/tasks/[taskId]/route.ts`
10. `src/app/api/tasks/[taskId]/execute/route.ts`
11. `src/app/api/tasks/[taskId]/link-persistent-id/route.ts`
12. `src/lib/auth/response.ts`
13. `src/lib/auth/state-token.ts`
14. `src/lib/auth/token-vault-factory.ts`
15. `src/lib/auth/validate-token.ts`
16. `src/app/api/test/token-shape/route.ts`
17. `src/app/api/test/refresh-shape/route.ts`

## Event Mapping

| Console Statement | Event Type         | Component               |
| ----------------- | ------------------ | ----------------------- |
| Token created     | `token.created`    | TokenVault              |
| Token refreshed   | `token.refreshed`  | NextAuth/KeycloakClient |
| Token revoked     | `token.revoked`    | KeycloakClient          |
| Keycloak request  | `keycloak.request` | KeycloakClient          |
| Keycloak error    | `keycloak.error`   | KeycloakClient          |
| Vault store       | `vault.store`      | TokenVault              |
| Vault retrieve    | `vault.retrieve`   | TokenVault              |
| Vault error       | `vault.error`      | TokenVault              |
| API request       | `api.request`      | API Routes              |
| API error         | `api.error`        | API Routes              |

## Next Steps

1. Complete remaining Keycloak client methods
2. Complete token vault methods (Postgres & Redis)
3. Update all API routes
4. Update utility files
5. Remove all console.\* statements
6. Test logging output in development and production

## Testing

```bash
# Set log level
export LOG_LEVEL=debug

# Run dev server
pnpm dev

# Check logs are structured and pretty-printed
```
