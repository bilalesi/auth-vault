# Fix Keycloak Consent Screen - Step by Step

## Problem

The consent screen is not appearing even with `prompt=consent` parameter.

## Root Cause

Keycloak client is likely configured with **Consent Required: OFF**, which means Keycloak will never show a consent screen regardless of the `prompt` parameter.

## Solution: Enable Consent in Keycloak Client

### Step 1: Access Keycloak Admin Console

1. Open browser and go to: `http://localhost:8081/auth/admin`
2. Login with admin credentials:
   - Username: `admin`
   - Password: `admin` (or your admin password)

### Step 2: Navigate to Your Client

1. Select your realm (e.g., **SBO**)
2. Click **Clients** in the left sidebar
3. Find and click your client (e.g., **nextjs-app** or whatever your `KEYCLOAK_CLIENT_ID` is)

### Step 3: Enable Consent Required

1. In the **Settings** tab, scroll down to find:
   - **Consent Required**: Turn this **ON** ✅
2. Click **Save** at the bottom

### Step 4: Configure Consent Screen Text (Optional)

1. Still in the client settings, scroll to:
   - **Consent Screen Text**: Enter a friendly name like "NextJS Task Manager"
2. Click **Save**

### Step 5: Verify Client Scopes

1. Go to the **Client Scopes** tab of your client
2. Make sure **offline_access** is in either:

   - **Default Client Scopes** (always included), OR
   - **Optional Client Scopes** (can be requested)

3. If `offline_access` is not there:
   - Click **Add client scope**
   - Select **offline_access**
   - Choose **Optional** or **Default**
   - Click **Add**

### Step 6: Check Redirect URI

1. Back in **Settings** tab
2. Verify **Valid Redirect URIs** includes:

   ```
   http://localhost:3000/*
   http://localhost:3000/api/auth/manager/offline-callback
   ```

3. If not, add them and click **Save**

### Step 7: Revoke Existing Consent (Important!)

Even after enabling "Consent Required", you need to revoke any existing consent:

#### Option A: Via Admin Console

1. Go to **Users** in left sidebar
2. Find your user and click on it
3. Go to **Consents** tab
4. Find your client (nextjs-app)
5. Click **Revoke** button
6. Confirm the revocation

#### Option B: Via User Account Console

1. Go to: `http://localhost:8081/auth/realms/SBO/account`
2. Login as your user
3. Click **Applications** in the left menu
4. Find your application
5. Click **Remove Access** or **Revoke**

### Step 8: Test the Flow

1. Go back to your app: `http://localhost:3000/tasks`
2. Create a new task
3. Click **Request Offline Token**
4. You should now see the Keycloak consent screen!

## Expected Consent Screen

You should see something like:

```
┌─────────────────────────────────────────┐
│  Grant Access to NextJS Task Manager    │
├─────────────────────────────────────────┤
│                                         │
│  The application is requesting access   │
│  to the following:                      │
│                                         │
│  ✓ View your profile                   │
│  ✓ View your email address             │
│  ✓ Offline access                      │
│                                         │
│  [No, cancel]  [Yes, allow]            │
└─────────────────────────────────────────┘
```

## Verification Checklist

After making changes, verify:

- [ ] Consent Required is **ON** in client settings
- [ ] offline_access scope is available (Default or Optional)
- [ ] Valid Redirect URIs include the callback URL
- [ ] Existing consent has been revoked
- [ ] Browser cache cleared (or use incognito mode)

## Alternative: Use Keycloak CLI (kcadm)

If you prefer command line:

```bash
# 1. Login to Keycloak CLI
docker exec -it keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080/auth \
  --realm master \
  --user admin \
  --password admin

# 2. Enable consent required for your client
docker exec -it keycloak /opt/keycloak/bin/kcadm.sh update clients/<CLIENT_UUID> \
  -r SBO \
  -s consentRequired=true

# 3. Revoke user consent
docker exec -it keycloak /opt/keycloak/bin/kcadm.sh delete \
  users/<USER_ID>/consents/<CLIENT_ID> \
  -r SBO
```

## Still Not Working?

### Debug Step 1: Check the Authorization URL

Add this to your code temporarily to see the URL:

```typescript
// In src/app/api/auth/manager/offline-consent/route.ts
console.log("Authorization URL:", consentUrl);
```

The URL should look like:

```
http://localhost:8081/auth/realms/SBO/protocol/openid-connect/auth?
  client_id=nextjs-app&
  response_type=code&
  scope=openid+profile+email+offline_access&
  redirect_uri=http://localhost:3000/api/auth/manager/offline-callback&
  state=BASE64_STATE&
  prompt=consent
```

### Debug Step 2: Test URL Manually

Copy the URL from console and paste it directly in browser. You should see the consent screen.

### Debug Step 3: Check Keycloak Logs

```bash
docker logs keycloak -f --tail 100
```

Look for any errors or warnings related to consent.

### Debug Step 4: Try Different Browser

Sometimes browser cache can cause issues. Try:

1. Incognito/Private mode
2. Different browser
3. Clear all cookies for localhost:8081

### Debug Step 5: Check Client Configuration Export

Export your client configuration to verify:

1. In Keycloak Admin Console
2. Go to Clients → Your Client
3. Click **Export** at the top
4. Check the JSON for:
   ```json
   {
     "consentRequired": true,
     "defaultClientScopes": [...],
     "optionalClientScopes": ["offline_access", ...]
   }
   ```

## Quick Fix Script

Create a script to configure Keycloak automatically:

```bash
#!/bin/bash
# configure-keycloak-consent.sh

KEYCLOAK_URL="http://localhost:8081/auth"
REALM="SBO"
CLIENT_ID="nextjs-app"
ADMIN_USER="admin"
ADMIN_PASS="admin"

echo "Configuring Keycloak client for consent..."

# This would require kcadm.sh or REST API calls
# See Keycloak documentation for REST API usage

echo "Please configure manually using the steps above"
```

## Common Mistakes

1. ❌ **Consent Required is OFF** → Turn it ON
2. ❌ **offline_access scope not added** → Add it to client scopes
3. ❌ **Old consent not revoked** → Revoke existing consent
4. ❌ **Wrong redirect URI** → Must match exactly
5. ❌ **Browser cache** → Clear cache or use incognito
6. ❌ **Wrong realm** → Make sure you're in the correct realm

## Success Indicators

You'll know it's working when:

1. ✅ You see the Keycloak consent screen
2. ✅ The screen lists "Offline access" as a permission
3. ✅ After clicking "Yes", you're redirected back to /tasks
4. ✅ The task shows "Token: active" status
5. ✅ You can execute the task successfully

## Need More Help?

If still not working, provide:

1. Screenshot of client settings (Settings tab)
2. Screenshot of client scopes (Client Scopes tab)
3. The authorization URL from console logs
4. Any errors from browser console
5. Keycloak version you're using
