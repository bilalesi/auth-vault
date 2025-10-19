# Authentication API Endpoints

This document describes the authentication API endpoints for token management.

## Overview

All endpoints require authentication via Bearer token in the Authorization header:

```
Authorization: Bearer <access_token>
```

## Endpoints

### 1. GET Refresh Token ID

**Endpoint:** `POST /api/auth/token/refresh-id`

**Description:** Returns the persistent token ID for the user's refresh token. Used by external services (like Jupyter Launcher) to get a token ID that can be used to obtain fresh access tokens.

**Headers:**

```
Authorization: Bearer <access_token>
```

**Response:**

```json
{
  "persistentTokenId": "uuid-string",
  "expiresAt": "2024-01-01T00:00:00.000Z"
}
```

**Error Responses:**

- `401 Unauthorized` - Missing or invalid access token
- `404 Not Found` - No refresh token available (user needs to log in)
- `500 Internal Server Error` - Server error

**Requirements:** 9.1, 3.1, 3.2

---

### 2. Request Offline Token ID

**Endpoint:** `POST /api/auth/token/offline-id`

**Description:** Requests an offline token from Keycloak and returns a persistent token ID. Offline tokens are long-lived tokens (10 days) used for background tasks that run after user logout.

**Headers:**

```
Authorization: Bearer <access_token>
```

**Request Body:**

```json
{
  "redirectUri": "https://your-app.com/callback" // optional
}
```

**Response:**

```json
{
  "persistentTokenId": "uuid-string",
  "expiresAt": "2024-01-01T00:00:00.000Z"
}
```

Or if consent is required:

```json
{
  "consentUrl": "https://keycloak.example.com/auth/realms/..."
}
```

**Error Responses:**

- `401 Unauthorized` - Missing or invalid access token
- `400 Bad Request` - No refresh token available
- `404 Not Found` - Refresh token not found
- `500 Internal Server Error` - Server error

**Requirements:** 9.2, 5.1, 5.2, 5.3

---

### 3. Get Access Token

**Endpoint:** `POST /api/auth/token/access`

**Description:** Exchanges a persistent token ID for a fresh access token. Works with both refresh tokens and offline tokens.

**Request Body:**

```json
{
  "persistentTokenId": "uuid-string"
}
```

**Response:**

```json
{
  "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600,
  "tokenType": "Bearer"
}
```

**Error Responses:**

- `400 Bad Request` - Invalid request body
- `401 Unauthorized` - Token expired or invalid
- `404 Not Found` - Token not found
- `500 Internal Server Error` - Server error or Keycloak error

**Requirements:** 9.3, 3.4, 3.5, 4.4, 4.5, 6.3, 6.4, 6.5

---

### 4. Revoke Offline Token

**Endpoint:** `DELETE /api/auth/token/offline-id`

**Description:** Revokes an offline token by removing it from Keycloak and the token vault.

**Request Body:**

```json
{
  "persistentTokenId": "uuid-string"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Offline token revoked successfully"
}
```

**Error Responses:**

- `400 Bad Request` - Invalid request body or can only revoke offline tokens
- `404 Not Found` - Token not found
- `500 Internal Server Error` - Server error

**Requirements:** 9.4, 7.1, 7.2, 7.3, 7.4, 7.5

---

### 5. Logout

**Endpoint:** `POST /api/auth/logout`

**Description:** Custom logout handler that revokes the refresh token in Keycloak and deletes it from the vault. Should be called before NextAuth signOut.

**Response:**

```json
{
  "success": true
}
```

**Error Responses:**

- `401 Unauthorized` - No active session
- `500 Internal Server Error` - Server error

**Requirements:** 1.5, 10.4

---

## Token Flow Examples

### Jupyter Notebook Flow

1. **Jupyter Launcher** receives notebook launch request with user's access token
2. **Jupyter Launcher** calls `POST /api/auth/token/refresh-id` with access token
3. API returns `persistentTokenId`
4. **Jupyter Launcher** injects `persistentTokenId` into notebook environment
5. **Notebook code** calls `POST /api/auth/token/access` with `persistentTokenId` to get fresh access tokens
6. **Notebook code** uses access token to call protected APIs

### Background Task Flow

1. **Task Manager** receives task launch request with user's access token
2. **Task Manager** calls `POST /api/auth/token/offline-id` with access token
3. API returns `persistentTokenId` (or `consentUrl` if consent needed)
4. **Task Manager** stores `persistentTokenId` with task
5. **Background task** calls `POST /api/auth/token/access` with `persistentTokenId` to get fresh access tokens
6. **Background task** continues running even after user logs out
7. When task completes or is cancelled, call `DELETE /api/auth/token/offline-id` to revoke the offline token

---

## Security Notes

1. **Never expose refresh tokens or offline tokens** - Only persistent token IDs and access tokens are exposed to external services
2. **Access tokens are short-lived** - 1 hour lifetime
3. **Refresh tokens are session-bound** - 12 hours lifetime, tied to user session
4. **Offline tokens are long-lived** - 10 days lifetime, work after user logout
5. **All tokens are encrypted at rest** - AES-256-GCM encryption in the token vault
6. **Token rotation** - When Keycloak issues a new refresh token, it's automatically updated in the vault
7. **Authorization required** - All endpoints require valid Bearer token in Authorization header
