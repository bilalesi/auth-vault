# Auth Manager API Quick Reference

Quick reference card for Auth Manager API endpoints.

## Base URL

```
http://localhost:3000/api/auth/manager
```

## Authentication

All endpoints (except `/access-token`) require Bearer token:

```http
Authorization: Bearer <access_token>
```

---

## Endpoints

### 1. Validate Token

```http
GET /validate-token
Authorization: Bearer <token>
```

**Response**: `{}`

---

### 2. Get Refresh Token ID

```http
GET /refresh-token-id
Authorization: Bearer <token>
```

**Response**:

```json
{
  "persistentTokenId": "uuid",
  "expiresAt": "2024-12-31T23:59:59.000Z"
}
```

---

### 3. Request Offline Consent

```http
POST /offline-consent
Authorization: Bearer <token>
Content-Type: application/json

{
  "redirect_uri": "http://localhost:3000/api/auth/manager/offline-callback"
}
```

**Response**:

```json
{
  "consentUrl": "http://keycloak.../auth?...",
  "persistentTokenId": "uuid"
}
```

---

### 4. Offline Callback

```http
POST /offline-callback
Authorization: Bearer <token>
Content-Type: application/json

{
  "code": "auth_code",
  "state": "state_token"
}
```

**Response**:

```json
{
  "success": true,
  "persistentTokenId": "uuid",
  "expiresAt": "2024-12-31T23:59:59.000Z"
}
```

---

### 5. Get Access Token

```http
GET /access-token?persistent_token_id=<uuid>
```

**No auth required** - uses persistent token ID

**Response**:

```json
{
  "accessToken": "eyJhbG...",
  "expiresIn": 3600
}
```

---

### 6. List Offline Tokens

```http
GET /offline-tokens
Authorization: Bearer <token>
```

**Response**:

```json
{
  "tokens": [
    {
      "id": "uuid",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "expiresAt": "2024-12-31T23:59:59.000Z",
      "sessionState": "abc123",
      "tokenType": "offline"
    }
  ]
}
```

---

### 7. Revoke Offline Token

```http
DELETE /revoke-offline-token
Authorization: Bearer <token>
Content-Type: application/json

{
  "persistent_token_id": "uuid"
}
```

**Response**:

```json
{
  "success": true,
  "message": "Offline token deleted and session revoked successfully",
  "sessionRevoked": true,
  "tokensWithSameSession": 0
}
```

---

## Common Flows

### Jupyter Notebook Flow

1. Get refresh token ID:

   ```bash
   curl -X GET http://localhost:3000/api/auth/manager/refresh-token-id \
     -H "Authorization: Bearer $ACCESS_TOKEN"
   ```

2. Pass `persistentTokenId` to Jupyter Launcher

3. In notebook, get access token:
   ```bash
   curl -X GET "http://localhost:3000/api/auth/manager/access-token?persistent_token_id=$TOKEN_ID"
   ```

### Background Task Flow

1. Request offline consent:

   ```bash
   curl -X POST http://localhost:3000/api/auth/manager/offline-consent \
     -H "Authorization: Bearer $ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"redirect_uri": "http://localhost:3000/api/auth/manager/offline-callback"}'
   ```

2. Redirect user to `consentUrl`

3. Handle callback (automatic)

4. Use `persistentTokenId` in background task

5. When done, revoke token:
   ```bash
   curl -X DELETE http://localhost:3000/api/auth/manager/revoke-offline-token \
     -H "Authorization: Bearer $ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"persistent_token_id": "$TOKEN_ID"}'
   ```

---

## Error Codes

| Code                 | Status | Description           |
| -------------------- | ------ | --------------------- |
| `unauthorized`       | 401    | Invalid/missing token |
| `token_not_found`    | 404    | Token not found       |
| `no_refresh_token`   | 404    | No refresh token      |
| `token_expired`      | 401    | Token expired         |
| `invalid_token_type` | 400    | Wrong token type      |
| `keycloak_error`     | 500    | Keycloak error        |
| `validation_error`   | 400    | Invalid request       |

---

## Testing

### Get Access Token (for testing)

```bash
# Login to get access token
curl -X POST http://localhost:8081/auth/realms/master/protocol/openid-connect/token \
  -d "client_id=nextjs-app" \
  -d "client_secret=your-client-secret-change-in-production" \
  -d "grant_type=password" \
  -d "username=testuser" \
  -d "password=testpassword" \
  | jq -r '.access_token'
```

### Test Scripts

```bash
./scripts/test-offline-token.sh
./scripts/test-token-revocation.sh
./scripts/test-offline-tokens-list.sh
```

---

## Environment

### Local Development

- Keycloak: `http://localhost:8081/auth`
- API: `http://localhost:3000`
- Admin: `http://localhost:8081/auth/admin` (admin/admin)

### Test Credentials

- Username: `testuser`
- Password: `testpassword`
- Client ID: `nextjs-app`
- Client Secret: `your-client-secret-change-in-production`

---

## Rate Limits (Recommended)

| Endpoint                | Limit   |
| ----------------------- | ------- |
| `/validate-token`       | 100/min |
| `/refresh-token-id`     | 10/min  |
| `/offline-consent`      | 5/min   |
| `/access-token`         | 60/min  |
| `/revoke-offline-token` | 10/min  |

---

## Support

- Full API Docs: `docs/API_REFERENCE.md`
- OpenAPI Spec: `docs/openapi.yaml`
- Setup Guide: `docs/SETUP_GUIDE.md`
