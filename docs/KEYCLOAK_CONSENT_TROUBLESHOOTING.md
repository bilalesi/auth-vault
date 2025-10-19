# Keycloak Consent Screen Troubleshooting

## Issue: Consent Screen Not Appearing

If you're being redirected directly back to your app without seeing the Keycloak consent screen, this is because:

### Root Cause

Keycloak remembers consent decisions. Once a user grants consent for a scope (like `offline_access`), Keycloak won't ask again unless:

1. The consent is revoked
2. You force it with `prompt=consent`
3. The client settings require consent

## Solution 1: Force Consent with `prompt=consent` ✅

**Already implemented in the code:**

```typescript
const authParams = new URLSearchParams({
  client_id: process.env.KEYCLOAK_CLIENT_ID!,
  response_type: "code",
  scope: "openid profile email offline_access",
  redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/manager/offline-callback`,
  state: stateToken,
  prompt: "consent", // This forces the consent screen
});
```

This parameter tells Keycloak to always show the consent screen, even if the user has previously granted consent.

## Solution 2: Revoke Existing Consent in Keycloak

### Via Keycloak Admin Console:

1. Log into Keycloak Admin Console
2. Go to your realm (e.g., "SBO")
3. Navigate to **Users** → Find your user
4. Click on the **Consents** tab
5. Find your client (e.g., "nextjs-app")
6. Click **Revoke** to remove the consent
7. Try the flow again

### Via User Account Console:

1. Go to: `http://localhost:8081/auth/realms/SBO/account`
2. Log in as the user
3. Go to **Applications** section
4. Find your application
5. Click **Remove Access** or **Revoke Consent**

## Solution 3: Configure Client to Require Consent

### In Keycloak Admin Console:

1. Go to **Clients** → Select your client
2. Go to **Settings** tab
3. Enable **Consent Required**
4. Save

This makes Keycloak always ask for consent for this client.

## Solution 4: Test with Different Scopes

If you want to test the consent flow, you can request additional scopes that haven't been granted yet:

```typescript
scope: "openid profile email offline_access microprofile-jwt";
```

## Verification Steps

### 1. Check the Authorization URL

The generated URL should include `prompt=consent`:

```
http://localhost:8081/auth/realms/SBO/protocol/openid-connect/auth?
  client_id=nextjs-app&
  response_type=code&
  scope=openid+profile+email+offline_access&
  redirect_uri=http://localhost:3000/api/auth/manager/offline-callback&
  state=BASE64_STATE_TOKEN&
  prompt=consent  ← This should be present
```

### 2. Check Browser Network Tab

1. Open browser DevTools (F12)
2. Go to Network tab
3. Click "Request Offline Token"
4. Look for the redirect to Keycloak
5. Check if `prompt=consent` is in the URL

### 3. Check Keycloak Logs

```bash
docker logs keycloak-container -f
```

Look for consent-related messages.

## Expected Flow

### With `prompt=consent`:

```
1. User clicks "Request Offline Token"
   ↓
2. Redirects to Keycloak with prompt=consent
   ↓
3. Keycloak shows consent screen:
   "Application nextjs-app is requesting access to:
    ✓ View your profile
    ✓ View your email
    ✓ Offline access"
   ↓
4. User clicks "Yes" or "No"
   ↓
5. Redirects back to /api/auth/manager/offline-callback
   ↓
6. Token is exchanged and stored
```

### Without `prompt=consent` (old behavior):

```
1. User clicks "Request Offline Token"
   ↓
2. Redirects to Keycloak
   ↓
3. Keycloak checks: "User already consented"
   ↓
4. Immediately redirects back (no consent screen)
   ↓
5. Token is exchanged and stored
```

## Testing the Consent Screen

### Test 1: Fresh User

Create a new user in Keycloak who has never logged in to your app. They will see the consent screen.

### Test 2: Revoked Consent

1. Revoke consent for existing user (see Solution 2)
2. Try the flow again
3. Consent screen should appear

### Test 3: Different Client

Create a new client in Keycloak and test with that. First-time consent will be required.

## Common Issues

### Issue: Still No Consent Screen

**Check:**

1. Is `prompt=consent` in the URL? (Check browser network tab)
2. Is the client configured correctly in Keycloak?
3. Are you using the correct realm?
4. Is Keycloak running and accessible?

**Debug:**

```bash
# Check the generated URL
curl -X POST http://localhost:3000/api/auth/manager/offline-consent \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"taskId": "550e8400-e29b-41d4-a716-446655440000"}' \
  | jq .consentUrl
```

### Issue: Error After Consent

**Check:**

1. Is the redirect URI configured in Keycloak?
2. Is the callback endpoint working?
3. Check browser console for errors
4. Check server logs

**Verify Redirect URI in Keycloak:**

```
Clients → Your Client → Settings → Valid Redirect URIs
Should include: http://localhost:3000/api/auth/manager/offline-callback
```

### Issue: Token Not Stored After Consent

**Check:**

1. Database connection (PostgreSQL or Redis)
2. Encryption key is set
3. Callback endpoint logs
4. Task database is working

**Debug:**

```bash
# Check if token was stored
# For PostgreSQL:
psql -d your_db -c "SELECT id, status, task_id FROM token_vault WHERE status = 'active' ORDER BY created_at DESC LIMIT 5;"

# Check task status
curl http://localhost:3000/api/tasks/YOUR_TASK_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Keycloak Client Configuration Checklist

Ensure your Keycloak client has:

- ✅ **Client ID**: Matches `KEYCLOAK_CLIENT_ID` in `.env.local`
- ✅ **Client Protocol**: openid-connect
- ✅ **Access Type**: confidential
- ✅ **Standard Flow Enabled**: ON
- ✅ **Direct Access Grants Enabled**: ON
- ✅ **Valid Redirect URIs**:
  - `http://localhost:3000/*`
  - `http://localhost:3000/api/auth/manager/offline-callback`
- ✅ **Web Origins**: `http://localhost:3000`
- ✅ **Client Scopes**:
  - `offline_access` (Optional or Default)
  - `openid`, `profile`, `email` (Default)

## Alternative: Manual Consent Testing

If you want to manually test the consent screen without the app:

```bash
# 1. Generate a state token manually
STATE="test-state-$(date +%s)"

# 2. Visit this URL in browser
open "http://localhost:8081/auth/realms/SBO/protocol/openid-connect/auth?client_id=nextjs-app&response_type=code&scope=openid+offline_access&redirect_uri=http://localhost:3000/api/auth/manager/offline-callback&state=$STATE&prompt=consent"

# 3. You should see the consent screen
```

## Summary

The `prompt=consent` parameter is now added to the authorization URL, which will force Keycloak to show the consent screen every time, even if the user has previously granted consent. This ensures users can see and understand what permissions they're granting for offline access.

If you still don't see the consent screen after this change:

1. Clear browser cache and cookies
2. Try in incognito/private mode
3. Check Keycloak client configuration
4. Verify the URL includes `prompt=consent`
