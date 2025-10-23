# Offline Token Quick Start Guide

## Setup

### 1. Run Database Migration

```bash
npm run db:migrate
```

Or manually execute:

```sql
ALTER TABLE token_vault
  ALTER COLUMN encrypted_token DROP NOT NULL,
  ALTER COLUMN iv DROP NOT NULL,
  ADD COLUMN status TEXT,
  ADD COLUMN task_id TEXT,
  ADD COLUMN state_token TEXT;

CREATE INDEX token_vault_task_id_idx ON token_vault (task_id);
CREATE INDEX token_vault_state_token_idx ON token_vault (state_token);
```

### 2. Configure Keycloak

Add the callback URL to your Keycloak client's valid redirect URIs:

```
http://localhost:3000/api/auth/manager/offline-callback
```

## Usage

### Frontend Implementation

```typescript
// Step 1: Request consent URL
async function requestOfflineToken(taskId: string) {
  const response = await fetch("/api/auth/manager/offline-consent", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ taskId }),
  });

  const { consentUrl, persistentTokenId } = await response.json();

  // Store for later use
  localStorage.setItem("pendingTokenId", persistentTokenId);
  localStorage.setItem("pendingTaskId", taskId);

  // Redirect user to consent
  window.location.href = consentUrl;
}

// Step 2: After redirect back, check token status
async function checkTokenReady() {
  const persistentTokenId = localStorage.getItem("pendingTokenId");

  try {
    const response = await fetch("/api/auth/manager/access-token", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ persistentTokenId }),
    });

    if (response.ok) {
      const { accessToken } = await response.json();
      console.log("Token is ready!", accessToken);
      return true;
    }
  } catch (error) {
    console.log("Token not ready yet, will retry...");
  }

  return false;
}

// Step 3: Use the token
async function useOfflineToken() {
  const persistentTokenId = localStorage.getItem("pendingTokenId");

  const response = await fetch("/api/auth/manager/access-token", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ persistentTokenId }),
  });

  const { accessToken: freshToken } = await response.json();

  // Use fresh token for API calls
  await fetch("https://api.example.com/data", {
    headers: {
      Authorization: `Bearer ${freshToken}`,
    },
  });
}
```

### Backend/CLI Implementation

```typescript
import { GetStorage } from "@/services/auth-manager/auth/token-vault-factory";
import {
  generateStateToken,
  parseStateToken,
} from "@/services/auth-manager/auth/state-token";

// Create pending token request
async function createOfflineTokenRequest(userId: string, taskId: string) {
  const vault = GetStorage();

  const persistentTokenId = await vault.createPendingOfflineToken(
    userId,
    taskId,
    "", // Will be updated with state token
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    { createdBy: "cli" }
  );

  const stateToken = generateStateToken({
    userId,
    taskId,
    persistentTokenId,
  });

  await vault.updateStateToken(persistentTokenId, stateToken);

  // Build consent URL
  const params = new URLSearchParams({
    client_id: process.env.KEYCLOAK_CLIENT_ID!,
    response_type: "code",
    scope: "openid offline_access",
    redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/manager/offline-callback`,
    state: stateToken,
  });

  const consentUrl = `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/auth?${params}`;

  console.log("Visit this URL to grant consent:");
  console.log(consentUrl);
  console.log("\nToken ID:", persistentTokenId);

  return { consentUrl, persistentTokenId, stateToken };
}

// Check token status
async function checkTokenStatus(persistentTokenId: string) {
  const vault = GetStorage();
  const entry = await vault.retrieve(persistentTokenId);

  if (!entry) {
    return { status: "not_found" };
  }

  return {
    status: entry.status,
    taskId: entry.taskId,
    hasToken: !!entry.encryptedToken,
  };
}

// Usage
const { persistentTokenId } = await createOfflineTokenRequest(
  "user-123",
  "jupyter-task-456"
);

// Poll for completion
const interval = setInterval(async () => {
  const status = await checkTokenStatus(persistentTokenId);

  if (status.status === "active") {
    console.log("Token is ready!");
    clearInterval(interval);
  } else if (status.status === "failed") {
    console.log("Token request failed");
    clearInterval(interval);
  } else {
    console.log("Waiting for user consent...");
  }
}, 2000);
```

## API Reference

### POST /api/auth/manager/offline-consent

**Request:**

```json
{
  "taskId": "jupyter-task-123",
  "redirectUri": "http://localhost:3000/dashboard" // optional
}
```

**Response:**

```json
{
  "consentUrl": "http://localhost:8081/auth/realms/SBO/protocol/openid-connect/auth?...",
  "persistentTokenId": "660f9511-f39c-52e5-b827-557766551111",
  "stateToken": "NTUwZTg0MDAtZTI5Yi00MWQ0LWE3MTYtNDQ2NjU1NDQwMDAwOmp1cHl0ZXItdGFzay0xMjM6NjYwZjk1MTEtZjM5Yy01MmU1LWI4MjctNTU3NzY2NTUxMTEx",
  "message": "Visit this URL to grant offline_access consent, then the token will be automatically stored"
}
```

### GET /api/auth/manager/offline-callback

**Automatically called by Keycloak after consent**

Query parameters:

- `code`: Authorization code
- `state`: State token

**Response:**

```json
{
  "success": true,
  "persistentTokenId": "660f9511-f39c-52e5-b827-557766551111",
  "taskId": "jupyter-task-123",
  "message": "Offline token successfully obtained and stored"
}
```

## Database Queries

### Check pending tokens

```sql
SELECT id, user_id, task_id, status, created_at
FROM token_vault
WHERE status = 'pending'
ORDER BY created_at DESC;
```

### Check tokens by task

```sql
SELECT id, user_id, status, created_at, expires_at
FROM token_vault
WHERE task_id = 'jupyter-task-123';
```

### Clean up failed tokens

```sql
DELETE FROM token_vault
WHERE status = 'failed'
AND created_at < NOW() - INTERVAL '7 days';
```

## Troubleshooting

### Token stuck in pending

- Check if user completed consent flow
- Verify callback URL is configured in Keycloak
- Check application logs for callback errors

### Callback fails

- Verify `KEYCLOAK_CLIENT_SECRET` is correct
- Check redirect URI matches exactly
- Ensure Keycloak is accessible from server

### State token invalid

- State tokens expire with the token request (1 year)
- Verify state token wasn't modified
- Check database for matching state_token

## Testing

```bash
# 1. Request consent
curl -X POST http://localhost:3000/api/auth/manager/offline-consent \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"taskId": "test-123"}'

# 2. Visit the returned consentUrl in browser

# 3. After redirect, check database
psql -d your_db -c "SELECT id, status, task_id FROM token_vault WHERE task_id = 'test-123';"

# 4. Use the token
curl -X POST http://localhost:3000/api/auth/manager/access-token \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"persistentTokenId": "YOUR_TOKEN_ID"}'
```

## Security Best Practices

1. **Always use HTTPS** in production
2. **Validate state tokens** before processing callbacks
3. **Set appropriate token expiration** (default: 1 year)
4. **Monitor failed requests** for potential attacks
5. **Clean up old pending tokens** regularly
6. **Rotate encryption keys** periodically
7. **Audit token access** for compliance

## Next Steps

- Implement status polling endpoint
- Add webhook notifications
- Create admin dashboard for token management
- Set up monitoring and alerts
- Implement token rotation
