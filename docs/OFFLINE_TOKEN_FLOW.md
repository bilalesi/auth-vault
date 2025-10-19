# Offline Token Flow

This document explains the state-based OAuth consent flow for obtaining offline tokens.

## Overview

Offline tokens require user consent for the `offline_access` scope. The flow uses a state-based approach with database tracking:

1. **Request Consent URL** - Creates a pending token request and generates a consent URL with state
2. **User Grants Consent** - User visits the URL and grants consent
3. **OAuth Callback** - Keycloak redirects back with authorization code
4. **Token Exchange** - System exchanges code for offline token and updates the database

## Database Schema

The `token_vault` table includes these fields for offline token tracking:

- `status`: `'pending'` | `'active'` | `'failed'` - Tracks the token request lifecycle
- `task_id`: External task ID that this token is associated with
- `state_token`: Base64-encoded state containing `userId:taskId:persistentTokenId`
- `encrypted_token`: `null` for pending requests, encrypted token when active
- `iv`: `null` for pending requests, encryption IV when active

## State Token Format

State tokens encode three pieces of information:

```
base64url(userId:taskId:persistentTokenId)
```

Example:

```typescript
{
  userId: "550e8400-e29b-41d4-a716-446655440000",
  taskId: "jupyter-task-123",
  persistentTokenId: "660f9511-f39c-52e5-b827-557766551111"
}
// Encoded: "NTUwZTg0MDAtZTI5Yi00MWQ0LWE3MTYtNDQ2NjU1NDQwMDAwOmp1cHl0ZXItdGFzay0xMjM6NjYwZjk1MTEtZjM5Yy01MmU1LWI4MjctNTU3NzY2NTUxMTEx"
```

## Endpoints

### 1. POST /api/auth/manager/offline-consent

Creates a pending offline token request and generates a Keycloak consent URL.

**Request:**

```bash
curl -X POST http://localhost:3000/api/auth/manager/offline-consent \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "jupyter-task-123",
    "redirectUri": "http://localhost:3000/dashboard"
  }'
```

**Response:**

```json
{
  "consentUrl": "http://localhost:8081/auth/realms/SBO/protocol/openid-connect/auth?client_id=...&state=...",
  "persistentTokenId": "660f9511-f39c-52e5-b827-557766551111",
  "stateToken": "NTUwZTg0MDAtZTI5Yi00MWQ0LWE3MTYtNDQ2NjU1NDQwMDAwOmp1cHl0ZXItdGFzay0xMjM6NjYwZjk1MTEtZjM5Yy01MmU1LWI4MjctNTU3NzY2NTUxMTEx",
  "message": "Visit this URL to grant offline_access consent, then the token will be automatically stored"
}
```

**Parameters:**

- `taskId` (required): External task ID to associate with this token
- `redirectUri` (optional): Where to redirect after consent. Defaults to `/api/auth/manager/offline-callback`

**Database Changes:**

- Creates a new row in `token_vault` with:
  - `status`: `'pending'`
  - `task_id`: The provided task ID
  - `state_token`: Generated state token
  - `encrypted_token`: `null` (will be filled after consent)
  - `iv`: `null` (will be filled after consent)

### 2. GET /api/auth/manager/offline-callback

OAuth callback handler that receives the authorization code and exchanges it for an offline token.

**This endpoint is called automatically by Keycloak after user grants consent.**

**Query Parameters:**

- `code`: Authorization code from Keycloak
- `state`: State token from step 1
- `error`: Error code if consent was denied
- `error_description`: Error description

**Success Response:**

```json
{
  "success": true,
  "persistentTokenId": "660f9511-f39c-52e5-b827-557766551111",
  "taskId": "jupyter-task-123",
  "message": "Offline token successfully obtained and stored"
}
```

**Database Changes:**

- Updates the row identified by `state_token`:
  - `status`: `'active'` (or `'failed'` on error)
  - `encrypted_token`: The encrypted offline token
  - `iv`: The encryption IV

## Complete Flow

### Step 1: Request Consent URL

```typescript
const response = await fetch("/api/auth/manager/offline-consent", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    taskId: "jupyter-task-123",
    redirectUri: "http://localhost:3000/dashboard",
  }),
});

const { consentUrl, persistentTokenId, stateToken } = await response.json();

// Store persistentTokenId for later polling
localStorage.setItem("pendingOfflineToken", persistentTokenId);
```

### Step 2: Redirect User to Consent URL

```typescript
// Redirect user to grant consent
window.location.href = consentUrl;
```

### Step 3: User Grants Consent

User sees Keycloak consent screen and grants `offline_access` permission.

### Step 4: Automatic Token Exchange

Keycloak redirects to `/api/auth/manager/offline-callback?code=...&state=...`

The callback endpoint:

1. Parses the state token
2. Finds the pending token request in the database
3. Exchanges the authorization code for an offline token
4. Updates the database with the encrypted token
5. Sets status to `'active'`

### Step 5: Poll for Token Status (Optional)

```typescript
// After redirect, poll to check if token is ready
const persistentTokenId = localStorage.getItem("pendingOfflineToken");

async function checkTokenStatus() {
  const response = await fetch(`/api/auth/manager/access-token`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ persistentTokenId }),
  });

  if (response.ok) {
    // Token is active and can be used
    const { accessToken } = await response.json();
    console.log("Offline token is ready!");
  } else {
    // Still pending or failed
    setTimeout(checkTokenStatus, 2000);
  }
}

checkTokenStatus();
```

## Database Lifecycle

### Pending State

```sql
INSERT INTO token_vault (
  id, user_id, token_type, status, task_id, state_token,
  encrypted_token, iv, expires_at
) VALUES (
  '660f9511-...', '550e8400-...', 'offline', 'pending', 'jupyter-task-123',
  'NTUwZTg0MDAtZTI5Yi00MWQ0LWE3MTYtNDQ2NjU1NDQwMDAwOmp1cHl0ZXItdGFzay0xMjM6NjYwZjk1MTEtZjM5Yy01MmU1LWI4MjctNTU3NzY2NTUxMTEx',
  NULL, NULL, '2026-10-18 12:00:00'
);
```

### Active State (After Consent)

```sql
UPDATE token_vault
SET
  status = 'active',
  encrypted_token = 'a3f2b1c4d5e6...',
  iv = 'f7a8b9c0d1e2...'
WHERE state_token = 'NTUwZTg0MDAtZTI5Yi00MWQ0LWE3MTYtNDQ2NjU1NDQwMDAwOmp1cHl0ZXItdGFzay0xMjM6NjYwZjk1MTEtZjM5Yy01MmU1LWI4MjctNTU3NzY2NTUxMTEx';
```

### Failed State (On Error)

```sql
UPDATE token_vault
SET status = 'failed'
WHERE state_token = '...';
```

## Benefits of This Approach

1. **Stateful Tracking**: Database tracks the entire consent flow lifecycle
2. **Task Association**: Tokens are linked to specific tasks from creation
3. **Secure State**: State token encodes all necessary information
4. **Automatic Updates**: Callback handler automatically updates the database
5. **Error Handling**: Failed requests are tracked with `'failed'` status
6. **Polling Support**: Frontend can poll to check when token is ready
7. **No Manual Steps**: After consent, everything is automatic

## Security Notes

- State tokens are base64url-encoded (URL-safe)
- State tokens are stored in the database for validation
- Encrypted tokens are only stored after successful consent
- Failed requests are marked and can be retried
- All endpoints require valid Bearer token authentication
- State tokens expire with the token request (1 year for offline tokens)

## Migration

Run the migration to add new columns:

```bash
npm run db:migrate
```

Or manually:

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
