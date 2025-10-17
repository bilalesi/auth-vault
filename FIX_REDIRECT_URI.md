# Fix Redirect URI in Keycloak

## Problem

Getting error: `invalid_redirect_uri` when trying to log in.

## Solution

You need to add the NextAuth callback URL to your Keycloak client's allowed redirect URIs.

### Steps:

1. **Open Keycloak Admin Console**

   - Go to: http://localhost:8081/auth/admin
   - Login with: admin / admin

2. **Navigate to your client**

   - Select realm: **SBO**
   - Click **Clients** in the left sidebar
   - Find and click on client: **cli**

3. **Add Redirect URI**

   - Scroll down to **Valid redirect URIs** section
   - Add the following URI:
     ```
     http://localhost:3000/api/auth/callback/keycloak
     ```
   - Also add a wildcard for development:
     ```
     http://localhost:3000/*
     ```

4. **Add Web Origins** (for CORS)

   - Scroll down to **Web origins** section
   - Add:
     ```
     http://localhost:3000
     ```

5. **Save**
   - Click the **Save** button at the bottom

### Expected Configuration:

**Valid redirect URIs:**

- `http://localhost:3000/api/auth/callback/keycloak`
- `http://localhost:3000/*`

**Valid post logout redirect URIs:**

- `http://localhost:3000/*`

**Web origins:**

- `http://localhost:3000`

### Test Again

After saving, try logging in again at http://localhost:3000

The authentication should now work!
