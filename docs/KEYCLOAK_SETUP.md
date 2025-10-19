# Keycloak Setup Guide

This guide will help you configure Keycloak to work with the Next.js application.

## Prerequisites

- Docker and Docker Compose installed
- Keycloak running on `http://localhost:8081/auth`

## Step 1: Start Keycloak

```bash
docker-compose up -d
```

Wait for Keycloak to start (check logs with `docker-compose logs -f keycloak`).

## Step 2: Access Keycloak Admin Console

1. Open your browser and navigate to: `http://localhost:8081/auth/admin`
2. Login with:
   - Username: `admin`
   - Password: `admin`

## Step 3: Create a Client for Next.js

### 3.1 Navigate to Clients

1. In the left sidebar, click on **Clients**
2. Click **Create client** button

### 3.2 General Settings

- **Client type**: OpenID Connect
- **Client ID**: `nextjs-app`
- Click **Next**

### 3.3 Capability Config

- **Client authentication**: ON (this makes it a confidential client)
- **Authorization**: OFF
- **Authentication flow**:
  - ✅ Standard flow
  - ✅ Direct access grants
  - ❌ Implicit flow
  - ❌ Service accounts roles
- Click **Next**

### 3.4 Login Settings

- **Root URL**: `http://localhost:3000`
- **Home URL**: `http://localhost:3000`
- **Valid redirect URIs**:
  - `http://localhost:3000/*`
  - `http://localhost:3000/api/auth/callback/keycloak`
- **Valid post logout redirect URIs**: `http://localhost:3000/*`
- **Web origins**: `http://localhost:3000`
- Click **Save**

## Step 4: Get Client Secret

1. After saving, click on the **Credentials** tab
2. Copy the **Client secret** value
3. Update your `.env.local` file:
   ```bash
   KEYCLOAK_CLIENT_SECRET=<paste-your-client-secret-here>
   ```

## Step 5: Configure Client Scopes (for offline_access)

### 5.1 Add offline_access scope

1. Go to **Client scopes** in the left sidebar
2. Find `offline_access` in the list
3. Click on it
4. Go to the **Scope** tab
5. Make sure it's set to **Optional** or **Default**

### 5.2 Assign offline_access to the client

1. Go back to **Clients** → **nextjs-app**
2. Click on the **Client scopes** tab
3. Click **Add client scope**
4. Select `offline_access`
5. Choose **Optional** or **Default**
6. Click **Add**

## Step 6: Create a Test User

### 6.1 Navigate to Users

1. In the left sidebar, click on **Users**
2. Click **Add user** button

### 6.2 Create User

- **Username**: `testuser`
- **Email**: `testuser@example.com`
- **First name**: `Test`
- **Last name**: `User`
- **Email verified**: ON
- Click **Create**

### 6.3 Set Password

1. After creating the user, click on the **Credentials** tab
2. Click **Set password**
3. Enter a password (e.g., `password123`)
4. Set **Temporary**: OFF (so user doesn't need to change password on first login)
5. Click **Save**
6. Confirm by clicking **Save password**

## Step 7: Test the Configuration

1. Make sure your `.env.local` file has the correct values:

   ```bash
   KEYCLOAK_ISSUER=http://localhost:8081/auth/realms/master
   KEYCLOAK_CLIENT_ID=nextjs-app
   KEYCLOAK_CLIENT_SECRET=<your-client-secret>
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=<generated-secret>
   ```

2. Start the Next.js development server:

   ```bash
   pnpm dev
   ```

3. Open `http://localhost:3000` in your browser

4. Click "Sign in with Keycloak"

5. You should be redirected to Keycloak login page

6. Login with:

   - Username: `testuser`
   - Password: `password123`

7. After successful login, you should be redirected back to the Next.js app

## Troubleshooting

### Invalid redirect_uri

- Make sure the redirect URI in Keycloak matches exactly: `http://localhost:3000/api/auth/callback/keycloak`
- Check that you're using `http://` not `https://` for local development

### Client authentication failed

- Verify the client secret is correct in `.env.local`
- Make sure "Client authentication" is ON in Keycloak client settings

### Offline access not working

- Verify `offline_access` scope is added to the client
- Check that the authorization params in `src/auth.ts` include `offline_access` in the scope

### CORS errors

- Make sure "Web origins" is set to `http://localhost:3000` in Keycloak client settings

## Next Steps

Once authentication is working:

1. Test token refresh by waiting for the access token to expire
2. Implement the Token Vault for storing offline tokens
3. Create API routes for token management
4. Integrate with Jupyter Launcher and Task Manager

## Production Considerations

For production deployment:

1. Use HTTPS for all URLs
2. Update Keycloak realm to a production realm (not `master`)
3. Use strong client secrets
4. Configure proper CORS settings
5. Set up Keycloak with a production database
6. Enable Keycloak security features (rate limiting, etc.)
