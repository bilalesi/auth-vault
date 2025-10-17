# Fix Keycloak Frontend URL Issue

## Problem

After login, Keycloak redirects to `http://localhost:3000/realms/SBO/...` instead of `http://localhost:8081/auth/realms/SBO/...`

This happens because Keycloak is detecting the wrong frontend URL.

## Solution 1: Set Frontend URL in Realm Settings

1. **Open Keycloak Admin Console**

   - Go to: http://localhost:8081/auth/admin
   - Login with: admin / admin

2. **Navigate to Realm Settings**

   - Select realm: **SBO**
   - Click **Realm settings** in the left sidebar
   - Go to the **General** tab

3. **Set Frontend URL**
   - Find **Frontend URL** field
   - Set it to: `http://localhost:8081/auth`
   - Click **Save**

## Solution 2: Update Docker Compose Environment Variables

If Solution 1 doesn't work, we need to update the docker-compose.yml:

```yaml
environment:
  KC_HOSTNAME_URL: "http://localhost:8081/auth"
  KC_HOSTNAME_ADMIN_URL: "http://localhost:8081/auth"
  KC_HOSTNAME_STRICT: "false"
  KC_HOSTNAME_STRICT_HTTPS: "false"
```

Then restart Keycloak:

```bash
docker-compose restart keycloak
```

## Solution 3: Use Keycloak Admin CLI

Run this command to set the frontend URL:

```bash
docker-compose exec keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8081/auth \
  --realm master \
  --user admin \
  --password admin

docker-compose exec keycloak /opt/keycloak/bin/kcadm.sh update realms/SBO \
  -s 'attributes.frontendUrl="http://localhost:8081/auth"'
```

## Verify the Fix

After applying any solution, verify by checking the well-known configuration:

```bash
curl -s http://localhost:8081/auth/realms/SBO/.well-known/openid-configuration | grep '"issuer"'
```

It should show:

```json
"issuer": "http://localhost:8081/auth/realms/SBO"
```

## Test Authentication

1. Clear your browser cookies for localhost
2. Go to http://localhost:3000
3. Click "Sign in with Keycloak"
4. Login with your credentials
5. You should be redirected back to the app successfully
