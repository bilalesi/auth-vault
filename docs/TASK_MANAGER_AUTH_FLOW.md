# Task Manager Authentication Flow

This document explains how the Task Manager obtains and manages access tokens and offline tokens for executing tasks on behalf of users.

## Overview

The Auth Manager provides two main token flows:

1. **Access Token Flow** - Get short-lived access tokens for immediate API calls
2. **Offline Token Flow** - Get long-lived refresh tokens for background task execution

---

## 1. Access Token Flow (Simple)

Used when you already have a persistent token ID and need a fresh access token.

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ GET /api/auth/manager/access-token
       │ ?persistent_token_id={uuid}
       │ Authorization: Bearer {access_token}
       │
       ▼
┌─────────────────────────────────────┐
│  Access Token Endpoint              │
│  1. Validate user's access token    │
│  2. Retrieve refresh token from DB  │
│  3. Exchange with Keycloak          │
│  4. Return new access token         │
└──────┬──────────────────────────────┘
       │
       │ Response:
       │ {
       │   "accessToken": "eyJhbG...",
       │   "expiresIn": 300
       │ }
       │
       ▼
┌─────────────┐
│   Client    │
└─────────────┘
```

**Endpoint:** `GET /api/auth/manager/access-token`

**Query Parameters:**

- `persistent_token_id` - UUID of stored refresh/offline token

**Response:**

```json
{
  "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 300
}
```

---

## 2. Offline Token Flow (Complete)

Used for background tasks that need long-term access. Requires user consent.

### Step 1: Request Offline Consent

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ POST /api/auth/manager/request-offline-consent
       │ Authorization: Bearer {access_token}
       │ Body: { "taskId": "uuid" }
       │
       ▼
┌─────────────────────────────────────┐
│  Request Consent Endpoint           │
│  1. Validate user's access token    │
│  2. Create state token              │
│  3. Generate Keycloak consent URL   │
│  4. Store pending consent in DB     │
└──────┬──────────────────────────────┘
       │
       │ Response:
       │ {
       │   "consentUrl": "https://keycloak.../auth?...",
       │   "persistentTokenId": "uuid",
       │   "stateToken": "encrypted-state",
       │   "message": "Visit consentUrl to grant access"
       │ }
       │
       ▼
┌─────────────┐
│   Client    │
└─────────────┘
```

### Step 2: User Grants Consent

```
┌─────────────┐
│    User     │
└──────┬──────┘
       │
       │ Opens consentUrl in browser
       │
       ▼
┌─────────────────────────────────────┐
│         Keycloak                    │
│  1. User logs in (if needed)        │
│  2. Shows consent screen            │
│  3. User grants offline_access      │
└──────┬──────────────────────────────┘
       │
       │ Redirect to callback with:
       │ ?code={auth_code}&state={state_token}
       │
       ▼
┌─────────────────────────────────────┐
│  Offline Callback Endpoint          │
│  1. Validate state token            │
│  2. Exchange code for tokens        │
│  3. Store offline token in DB       │
│  4. Link to user session            │
└──────┬──────────────────────────────┘
       │
       │ Redirect to /tasks?success=true
       │
       ▼
┌─────────────┐
│    User     │
└─────────────┘
```

### Step 3: Retrieve Offline Token ID

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ GET /api/auth/manager/offline-token-id
       │ Authorization: Bearer {access_token}
       │
       ▼
┌─────────────────────────────────────┐
│  Offline Token ID Endpoint          │
│  1. Validate user's access token    │
│  2. Extract session ID              │
│  3. Retrieve persistent token ID    │
└──────┬──────────────────────────────┘
       │
       │ Response:
       │ {
       │   "persistentTokenId": "uuid",
       │   "sessionId": "session-id"
       │ }
       │
       ▼
┌─────────────┐
│   Client    │
└─────────────┘
```

### Step 4: Use Offline Token for Access

```
┌─────────────┐
│ Task Manager│
└──────┬──────┘
       │
       │ GET /api/auth/manager/access-token
       │ ?persistent_token_id={uuid}
       │ Authorization: Bearer {access_token}
       │
       ▼
┌─────────────────────────────────────┐
│  Access Token Endpoint              │
│  1. Retrieve offline token from DB  │
│  2. Exchange with Keycloak          │
│  3. Return fresh access token       │
└──────┬──────────────────────────────┘
       │
       │ Response:
       │ {
       │   "accessToken": "eyJhbG...",
       │   "expiresIn": 300
       │ }
       │
       ▼
┌─────────────┐
│ Task Manager│
│ Executes    │
│ Task        │
└─────────────┘
```

---

## 3. Complete Task Manager Flow

Here's how a task manager would use these endpoints end-to-end:

```
┌──────────────────────────────────────────────────────────────────┐
│                    TASK MANAGER FLOW                             │
└──────────────────────────────────────────────────────────────────┘

1. INITIAL SETUP (One-time per user)
   ┌─────────────┐
   │ Task Manager│
   └──────┬──────┘
          │
          │ Check if user has offline token
          │ GET /api/auth/manager/offline-token-id
          │
          ▼
   ┌─────────────┐
   │  No Token?  │───Yes───┐
   └──────┬──────┘         │
          │                │
          No               │ POST /api/auth/manager/request-offline-consent
          │                │ Body: { "taskId": "uuid" }
          │                │
          │                ▼
          │         ┌──────────────┐
          │         │ User Grants  │
          │         │   Consent    │
          │         └──────┬───────┘
          │                │
          │                │ Callback processes tokens
          │                │
          │                ▼
          │         ┌──────────────┐
          │         │ GET offline- │
          │         │  token-id    │
          │         └──────┬───────┘
          │                │
          └────────────────┘
                   │
                   ▼
          ┌──────────────────┐
          │ Store persistent │
          │    token ID      │
          └──────┬───────────┘
                 │
                 ▼

2. TASK EXECUTION (Every time task runs)
   ┌─────────────┐
   │ Task Manager│
   └──────┬──────┘
          │
          │ GET /api/auth/manager/access-token
          │ ?persistent_token_id={stored_uuid}
          │
          ▼
   ┌─────────────────┐
   │ Fresh Access    │
   │ Token Received  │
   └──────┬──────────┘
          │
          │ Use access token to call
          │ protected APIs
          │
          ▼
   ┌─────────────────┐
   │ Execute Task    │
   │ (API calls with │
   │  access token)  │
   └──────┬──────────┘
          │
          │ Task Complete
          │
          ▼
   ┌─────────────────┐
   │ Success!        │
   └─────────────────┘

3. TOKEN CLEANUP (When done)
   ┌─────────────┐
   │ Task Manager│
   └──────┬──────┘
          │
          │ DELETE /api/auth/manager/revoke-offline-token
          │
          ▼
   ┌─────────────────┐
   │ Token Revoked   │
   │ Session Cleaned │
   └─────────────────┘
```

---

## 4. Additional Endpoints

### Validate Token

**Endpoint:** `GET /api/auth/manager/validate-token`

Checks if the current access token is valid.

**Response:**

```json
{}
```

### Get Refresh Token ID

**Endpoint:** `GET /api/auth/manager/refresh-token-id`

Retrieves the user's refresh token ID and expiration.

**Response:**

```json
{
  "refreshTokenId": "uuid",
  "expiresAt": "2025-10-23T12:00:00Z"
}
```

### Revoke Offline Token

**Endpoint:** `DELETE /api/auth/manager/revoke-offline-token`

Revokes the offline token and cleans up the session.

**Response:**

```json
{
  "success": true,
  "message": "Offline token revoked successfully"
}
```

---

## 5. Error Handling

All endpoints return standardized error responses:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {
      "reason": "Additional context"
    }
  }
}
```

Common error codes:

- `UNAUTHORIZED` - Invalid or missing access token
- `TOKEN_NOT_FOUND` - Persistent token doesn't exist
- `INVALID_REQUEST` - Missing required parameters
- `KEYCLOAK_ERROR` - Error from Keycloak (consent denied, etc.)

---

## 6. Security Notes

1. **All endpoints require authentication** - Must include valid access token in Authorization header
2. **State tokens prevent CSRF** - Offline consent flow uses encrypted state tokens
3. **Tokens are encrypted at rest** - All tokens stored in database are encrypted
4. **Session isolation** - Each user session has separate token storage
5. **Automatic cleanup** - Revoking last token for a session also revokes Keycloak session

---

## 7. Database Schema

The system stores tokens in the `persistent_tokens` table:

```sql
CREATE TABLE persistent_tokens (
  id UUID PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  session_id VARCHAR NOT NULL,
  encrypted_token TEXT NOT NULL,
  token_type VARCHAR NOT NULL,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## Quick Reference

| Endpoint                                    | Method | Purpose                    | Auth Required |
| ------------------------------------------- | ------ | -------------------------- | ------------- |
| `/api/auth/manager/access-token`            | GET    | Get fresh access token     | ✅            |
| `/api/auth/manager/offline-token-id`        | GET    | Get persistent token ID    | ✅            |
| `/api/auth/manager/request-offline-consent` | POST   | Start offline consent flow | ✅            |
| `/api/auth/manager/offline-callback`        | GET    | Handle OAuth callback      | ❌            |
| `/api/auth/manager/refresh-token-id`        | GET    | Get refresh token info     | ✅            |
| `/api/auth/manager/validate-token`          | GET    | Validate current token     | ✅            |
| `/api/auth/manager/revoke-offline-token`    | DELETE | Revoke offline token       | ✅            |
