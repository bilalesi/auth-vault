# Keycloak CLI Client Setup Guide

This guide will help you configure the "cli" client in Keycloak.

## Option 1: Quick Setup with Master Realm (Recommended for Testing)

### Step 1: Access Keycloak Admin Console

1. Open your browser and navigate to: `http://localhost:8081/auth/admin`
2. Login with:
   - Username: `admin`
   - Password: `admin`

### Step 2: Create the "cli" Client

1. In the left sidebar, click on **Clients**
2. Click **Create client** button

#### General Settings

- **Client type**: OpenID Connect
- **Client ID**: `cli`
- Click **Next**

#### Capability Config

- **Client authentication**: ON (confidential client)
- **Authorization**: OFF
- **Authentication flow**:
  - ✅ Standard flow
  - ✅ Direct access grants
  - ❌ Implicit flow
  - ❌ Service accounts roles
- Click **Next**

#### Login Settings

- **Root URL**: `http://localhost:3000`
- **Home URL**: `http://localhost:3000`
- **Valid redirect URIs**:
  - `http://localhost:3000/*`
  - `http://localhost:3000/api/auth/callback/keycloak`
- **Valid post logout redirect URIs**: `http://localhost:3000/*`
- **Web origins**: `http://localhost:3000`
- Click **Save**

### Step 3: Verify Client Secret

1. After saving, click on the **Credentials** tab
2. Verify the **Client secret** matches your `.env.local`:
   - Current secret in `.env.local`: `D8vS0EkJrqLxD5C22SbY6dMyT4MC4dr8`
   - If different, either:
     - Copy the new secret to `.env.local`, OR
     - Regenerate and update `.env.local`

### Step 4: Configure Client Scopes

1. Click on the **Client scopes** tab
2. Click **Add client scope**
3. Select `offline_access`
4. Choose **Optional**
5. Click **Add**

Also add these scopes if not already present:

- `profile` (Default)
- `email` (Default)
- `openid` (Default)

### Step 5: Create a Test User

1. In the left sidebar, click on **Users**
2. Click **Add user** button
3. Fill in:
   - **Username**: `testuser`
   - **Email**: `testuser@example.com`
   - **First name**: `Test`
   - **Last name**: `User`
   - **Email verified**: ON
4. Click **Create**

5. After creating, click on the **Credentials** tab
6. Click **Set password**
7. Enter password: `password123`
8. Set **Temporary**: OFF
9. Click **Save** and confirm

### Step 6: Test the Configuration

1. Restart your Next.js dev server:

   ```bash
   pnpm dev
   ```

2. Open `http://localhost:3000`
3. Click "Sign in with Keycloak"
4. Login with:
   - Username: `testuser`
   - Password: `password123`

---

## Option 2: Create SBO Realm (For Production-like Setup)

If you want to use a custom "SBO" realm instead of "master":

### Step 1: Create SBO Realm

1. In Keycloak admin console, hover over the realm dropdown (top-left, shows "master")
2. Click **Create Realm**
3. Enter:
   - **Realm name**: `SBO`
4. Click **Create**

### Step 2: Follow Steps 2-6 from Option 1

Follow the same steps as Option 1, but now you're working in the SBO realm.

### Step 3: Update .env.local

Update your `.env.local` to use the SBO realm:

```bash
KEYCLOAK_ISSUER=http://localhost:8081/auth/realms/SBO
```

---

## Troubleshooting

### 404 Error on /realms/SBO/protocol/openid-connect/auth

**Cause**: The SBO realm doesn't exist in Keycloak.

**Solution**:

- Either create the SBO realm (Option 2 above), OR
- Use the master realm by updating `.env.local`:
  ```bash
  KEYCLOAK_ISSUER=http://localhost:8081/auth/realms/master
  ```

### Invalid client credentials

**Cause**: Client secret mismatch.

**Solution**:

1. Go to Keycloak → Clients → cli → Credentials tab
2. Copy the client secret
3. Update `.env.local` with the correct secret
4. Restart your dev server

### Invalid redirect_uri

**Cause**: Redirect URI not configured in Keycloak.

**Solution**:

1. Go to Keycloak → Clients → cli
2. Add to **Valid redirect URIs**:
   - `http://localhost:3000/*`
   - `http://localhost:3000/api/auth/callback/keycloak`
3. Save and try again

### Client not found

**Cause**: The "cli" client doesn't exist.

**Solution**: Follow Step 2 to create the client.

---

## Current Configuration

Your `.env.local` is currently set to:

- **Realm**: master (changed from SBO)
- **Client ID**: cli
- **Client Secret**: D8vS0EkJrqLxD5C22SbY6dMyT4MC4dr8

Make sure the "cli" client exists in the master realm with this configuration.
