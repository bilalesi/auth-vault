# Keycloak Client Configuration Checklist

## Client: `cli` in Realm: `SBO`

### General Settings

- ✅ **Client ID**: `cli`
- ✅ **Client Protocol**: openid-connect
- ✅ **Access Type**: confidential (or public if you prefer)

### Capability Config

- ✅ **Client authentication**: ON (for confidential clients)
- ✅ **Authorization**: OFF
- ✅ **Standard flow**: ON (Authorization Code Flow)
- ✅ **Direct access grants**: ON
- ✅ **Implicit flow**: OFF
- ✅ **Service accounts roles**: OFF (unless needed)

### Login Settings

- ✅ **Root URL**: `http://localhost:3000`
- ✅ **Home URL**: `http://localhost:3000`
- ✅ **Valid redirect URIs**:
  - `http://localhost:3000/api/auth/callback/keycloak`
  - `http://localhost:3000/*`
- ✅ **Valid post logout redirect URIs**: `http://localhost:3000/*`
- ✅ **Web origins**: `http://localhost:3000`

### Client Scopes

Make sure these scopes are assigned (either Default or Optional):

- ✅ `openid`
- ✅ `profile`
- ✅ `email`
- ✅ `offline_access` (Important for refresh tokens!)

To add `offline_access`:

1. Go to **Client scopes** tab in your client
2. Click **Add client scope**
3. Select `offline_access`
4. Choose **Optional** or **Default**
5. Click **Add**

### Credentials

- Get your **Client Secret** from the **Credentials** tab
- Update `.env.local` with:
  ```bash
  KEYCLOAK_CLIENT_SECRET=<your-client-secret>
  ```

## Quick Test

After configuration, test the well-known endpoint:

```bash
curl -s http://localhost:8081/auth/realms/SBO/.well-known/openid-configuration | grep -o '"scopes_supported":\[.*\]' | head -1
```

You should see `offline_access` in the list of supported scopes.

## Troubleshooting

### Error: invalid_redirect_uri

- Check that redirect URIs are exactly as listed above
- Make sure there are no trailing slashes
- Verify the realm name is correct (SBO)

### Error: invalid_client

- Check client secret matches in `.env.local`
- Verify client authentication is enabled

### Error: invalid_scope

- Make sure `offline_access` scope is added to client scopes
- Check that all required scopes are available in the realm
