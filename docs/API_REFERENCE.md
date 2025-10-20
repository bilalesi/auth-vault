# Auth Manager API Reference

Complete API reference for the Auth Manager service that handles token management for Keycloak authentication.

## Base URL

```
http://localhost:3000/api/auth/manager
```

## Authentication

All endpoints require authentication via Bearer token in the Authorization header:

```http
Authorization: Bearer <access_token>
```

The access token should be obtained from NextAuth.js session after user login.

## Endpoints

### 1. Validate Token

Validates the user's access token.

**Endpoint:** `GET /api/auth/manager/validate-token`

**Headers:**

```http
Authorization: Bearer <access_token>
```

**Response:** `200 OK`

```json
{}
```

**Error Responses:**

- `401 Unauthorized` - Invalid or missing access token

**Example:**

```bash
curl -X GET http://localhost:3000/api/auth/manager/validate-token \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

### 2. Get Refresh Token ID

Retrieves the user's refresh token ID and expiration time.

**Endpoint:** `GET /api/auth/manager/refresh-token-id`

**Headers:**

```http
Authorization: Bearer <access_token>
```

**Response:** `200 OK`

```json
{
  "persistentTokenId": "550e8400-e29b-41d4-a716-446655440000",
  "expiresAt": "2024-12-31T23:59:59.000Z"
}
```

**Error Responses:**

- `401 Unauthorized` - Invalid or missing access token
- `404 Not Found` - No refresh token found for user

**Example:**

```bash
curl -X GET http://localhost:3000/api/auth/manager/refresh-token-id \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Use Case:**
Used by external services (like Jupyter Launcher) to get a persistent token ID that can be used to obtain fresh access tokens without requiring the user to be logged in.

---

### 3. Request Offline Token Consent

Initiates the offline token consent flow by creating a pending token entry and returning the Keycloak consent URL.

**Endpoint:** `POST /api/auth/manager/offline-consent`

**Headers:**

```http
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "redirect_uri": "http://localhost:3000/api/auth/manager/offline-callback"
}
```

**Response:** `200 OK`

```json
{
  "consentUrl": "http://localhost:8081/auth/realms/master/protocol/openid-connect/auth?client_id=nextjs-app&response_type=code&scope=openid%20offline_access&redirect_uri=http://localhost:3000/api/auth/manager/offline-callback&state=abc123...",
  "persistentTokenId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Error Responses:**

- `401 Unauthorized` - Invalid or missing access token
- `400 Bad Request` - Invalid redirect_uri

**Example:**

```bash
curl -X POST http://localhost:3000/api/auth/manager/offline-consent \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{"redirect_uri": "http://localhost:3000/api/auth/manager/offline-callback"}'
```

**Use Case:**
First step in obtaining an offline token. The user must visit the `consentUrl` to grant offline access permission.

---

### 4. Offline Token Callback

Handles the callback from Keycloak after user grants offline token consent.

**Endpoint:** `POST /api/auth/manager/offline-callback`

**Headers:**

```http
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "code": "authorization_code_from_keycloak",
  "state": "state_token_from_consent_url"
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "persistentTokenId": "550e8400-e29b-41d4-a716-446655440000",
  "expiresAt": "2024-12-31T23:59:59.000Z"
}
```

**Error Responses:**

- `401 Unauthorized` - Invalid or missing access token
- `400 Bad Request` - Invalid code or state
- `404 Not Found` - State token not found or expired

**Example:**

```bash
curl -X POST http://localhost:3000/api/auth/manager/offline-callback \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{"code": "abc123...", "state": "xyz789..."}'
```

**Use Case:**
Automatically called by the redirect from Keycloak after user grants consent. Completes the offline token flow.

---

### 5. Get Access Token

Exchanges a persistent token ID for a fresh access token.

**Endpoint:** `GET /api/auth/manager/access-token`

**Query Parameters:**

- `persistent_token_id` (required) - UUID of the persistent token

**Response:** `200 OK`

```json
{
  "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600
}
```

**Error Responses:**

- `400 Bad Request` - Missing or invalid persistent_token_id
- `404 Not Found` - Token not found
- `401 Unauthorized` - Token expired or invalid
- `500 Internal Server Error` - Keycloak exchange failed

**Example:**

```bash
curl -X GET "http://localhost:3000/api/auth/manager/access-token?persistent_token_id=550e8400-e29b-41d4-a716-446655440000"
```

**Use Case:**
Used by external services (Jupyter notebooks, background tasks) to obtain fresh access tokens using a persistent token ID. Works with both refresh tokens and offline tokens.

---

### 6. List Offline Tokens

Lists all offline tokens for the authenticated user.

**Endpoint:** `GET /api/auth/manager/offline-tokens`

**Headers:**

```http
Authorization: Bearer <access_token>
```

**Response:** `200 OK`

```json
{
  "tokens": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "expiresAt": "2024-12-31T23:59:59.000Z",
      "sessionState": "abc123...",
      "tokenType": "offline"
    }
  ]
}
```

**Error Responses:**

- `401 Unauthorized` - Invalid or missing access token

**Example:**

```bash
curl -X GET http://localhost:3000/api/auth/manager/offline-tokens \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Use Case:**
Allows users to view all their active offline tokens for management purposes.

---

### 7. Revoke Offline Token

Revokes an offline token and optionally revokes the Keycloak session if it's the last token for that session.

**Endpoint:** `DELETE /api/auth/manager/revoke-offline-token`

**Headers:**

```http
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "persistent_token_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Offline token deleted and session revoked successfully",
  "sessionRevoked": true,
  "tokensWithSameSession": 0
}
```

**Error Responses:**

- `401 Unauthorized` - Invalid or missing access token, or user doesn't own the token
- `404 Not Found` - Token not found
- `400 Bad Request` - Token is not an offline token or is pending

**Example:**

```bash
curl -X DELETE http://localhost:3000/api/auth/manager/revoke-offline-token \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{"persistent_token_id": "550e8400-e29b-41d4-a716-446655440000"}'
```

**Use Case:**
Revokes an offline token when a background task is completed or cancelled. If this is the last token associated with a Keycloak session, the entire session is revoked.

---

## Complete Flow Examples

### Flow 1: Jupyter Notebook Launch

```mermaid
sequenceDiagram
    participant User
    participant WebApp
    participant AuthManager
    participant JupyterLauncher
    participant Notebook
    participant EntityCore

    User->>WebApp: Click "Launch Notebook"
    WebApp->>AuthManager: GET /refresh-token-id
    AuthManager-->>WebApp: {persistentTokenId}
    WebApp->>JupyterLauncher: Launch notebook with tokenId
    JupyterLauncher-->>User: Notebook URL

    Note over Notebook: User works in notebook

    Notebook->>AuthManager: GET /access-token?persistent_token_id=...
    AuthManager-->>Notebook: {accessToken, expiresIn}
    Notebook->>EntityCore: API call with accessToken
    EntityCore-->>Notebook: Response
```

### Flow 2: Background Task with Offline Token

```mermaid
sequenceDiagram
    participant User
    participant WebApp
    participant AuthManager
    participant TaskManager
    participant BackgroundTask
    participant EntityCore

    User->>WebApp: Start background task
    WebApp->>AuthManager: POST /offline-consent
    AuthManager-->>WebApp: {consentUrl, persistentTokenId}
    WebApp->>User: Redirect to consentUrl
    User->>Keycloak: Grant offline access
    Keycloak->>AuthManager: Callback with <code
    AuthManager->>Keycloak: Exchange code for offline token
    AuthManager-->>WebApp: {success, persistentTokenId}
    WebApp->>TaskManager: Start task with tokenId

    Note over User: User logs out

    BackgroundTask->>AuthManager: GET /access-token?persistent_token_id=...
    AuthManager-->>BackgroundTask: {accessToken, expiresIn}
    BackgroundTask->>EntityCore: API call with accessToken
    EntityCore-->>BackgroundTask: Response

    Note over BackgroundTask: Task completes

    BackgroundTask->>AuthManager: DELETE /revoke-offline-token
    AuthManager-->>BackgroundTask: {success}
```

---

## Error Handling

All endpoints return errors in the following format:

```json
{
  "error": {
    "code": "error_code",
    "message": "Human readable error message",
    "details": {
      "additionalInfo": "value"
    }
  }
}
```

### Common Error Codes

| Code                 | HTTP Status | Description                       |
| -------------------- | ----------- | --------------------------------- |
| `unauthorized`       | 401         | Missing or invalid access token   |
| `token_not_found`    | 404         | Persistent token ID not found     |
| `no_refresh_token`   | 404         | User has no refresh token         |
| `token_expired`      | 401         | Token has expired                 |
| `invalid_token_type` | 400         | Wrong token type for operation    |
| `keycloak_error`     | 500         | Error communicating with Keycloak |
| `validation_error`   | 400         | Request validation failed         |

---

## Security Considerations

### Token Storage

- All tokens are encrypted at rest using AES-256-GCM
- Each token has a unique initialization vector (IV)
- Encryption key must be 256 bits (32 bytes)

### Token Types

- **Refresh Token**: Session-bound, 12-hour lifetime
- **Offline Token**: Long-lived, 10-day lifetime, works after logout

### Access Control

- Users can only access their own tokens
- Token ownership is validated on every operation
- Persistent token IDs are UUIDs to prevent enumeration

### Best Practices

1. Never expose refresh or offline tokens to clients
2. Only share persistent token IDs with trusted services
3. Revoke offline tokens when tasks complete
4. Use short-lived access tokens (1 hour)
5. Implement rate limiting on token endpoints
6. Log all token operations for audit trails

---

## Rate Limiting

Recommended rate limits per user:

| Endpoint                | Limit      |
| ----------------------- | ---------- |
| `/validate-token`       | 100/minute |
| `/refresh-token-id`     | 10/minute  |
| `/offline-consent`      | 5/minute   |
| `/access-token`         | 60/minute  |
| `/revoke-offline-token` | 10/minute  |

---

## Monitoring

Key metrics to monitor:

- Token exchange success/failure rate
- Token expiration events
- Offline token creation/revocation
- Keycloak API latency
- Token vault query performance
- Session revocation events

---

## Development & Testing

### Local Setup

1. Start services:

```bash
docker-compose up -d
```

2. Configure environment:

```bash
cp .env.example .env.local
# Edit .env.local with your values
```

3. Run migrations:

```bash
pnpm drizzle-kit push
```

4. Start dev server:

```bash
pnpm dev
```

### Testing Endpoints

See `scripts/` directory for test scripts:

- `test-offline-token.sh` - Test offline token flow
- `test-token-revocation.sh` - Test token revocation
- `test-offline-tokens-list.sh` - Test listing tokens

---

## Support

For issues or questions:

- Check logs in the application console
- Review Keycloak admin console for token status
- Check database for token vault entries
- Review API error responses for details
