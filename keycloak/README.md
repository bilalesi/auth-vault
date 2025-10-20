# Keycloak Realm Configuration

This directory contains the Keycloak realm configuration that is automatically imported when starting the Keycloak container.

## Files

### realm-export.json

Pre-configured Keycloak realm with:

- **Realm**: `master`
- **Client**: `nextjs-app`
- **Test User**: `testuser` / `testpassword`

## Client Configuration

### nextjs-app Client

**Client ID**: `nextjs-app`

**Client Secret**: `your-client-secret-change-in-production`

⚠️ **IMPORTANT**: Change this secret in production!

**Redirect URIs**:

- `http://localhost:3000/*`
- `http://localhost:3000/api/auth/callback/keycloak`
- `http://localhost:3000/api/auth/manager/offline-callback`

**Web Origins**:

- `http://localhost:3000`

**Client Scopes**:

- Default: `web-origins`, `profile`, `roles`, `email`
- Optional: `address`, `phone`, `offline_access`, `microprofile-jwt`

**Settings**:

- Client authentication: ON
- Standard flow: ON
- Direct access grants: ON
- Service accounts: OFF

## Test User

**Username**: `testuser`
**Password**: `testpassword`
**Email**: `testuser@example.com`
**Email Verified**: Yes

## Automatic Import

The realm is automatically imported when Keycloak starts via docker-compose:

```yaml
keycloak:
  command: start --import-realm
  volumes:
    - ./keycloak/realm-export.json:/opt/keycloak/data/import/realm-export.json:ro
```

## Manual Import

If you need to manually import the realm:

1. Login to Keycloak Admin Console: `http://localhost:8081/auth/admin`
2. Username: `admin`, Password: `admin`
3. Click on the realm dropdown (top left)
4. Click "Create Realm"
5. Click "Browse" and select `realm-export.json`
6. Click "Create"

## Exporting Realm Configuration

To export the current realm configuration:

1. Login to Keycloak Admin Console
2. Select the realm you want to export
3. Go to "Realm settings" → "Action" → "Partial export"
4. Select what to export:
   - ✅ Export groups and roles
   - ✅ Export clients
   - ✅ Include users (for development only)
5. Click "Export"
6. Save the file as `realm-export.json`

Or use the CLI:

```bash
docker exec -it <keycloak-container> /opt/keycloak/bin/kc.sh export \
  --dir /tmp/export \
  --realm master \
  --users realm_file
```

## Production Considerations

### Security

1. **Change Client Secret**:

   ```bash
   # Generate a secure secret
   openssl rand -base64 32
   ```

   Update in Keycloak Admin Console:

   - Clients → nextjs-app → Credentials → Regenerate Secret

2. **Remove Test User**:

   - Delete `testuser` from the realm
   - Or remove the `users` section from `realm-export.json`

3. **Update Redirect URIs**:

   - Replace `localhost:3000` with your production domain
   - Use HTTPS URLs only

4. **Enable SSL**:
   - Set `sslRequired: "all"` in realm settings
   - Configure SSL certificates

### Realm Settings

1. **Login Settings**:

   - Enable "Remember Me"
   - Configure session timeouts
   - Set up password policies

2. **Security Defenses**:

   - Enable brute force detection (already enabled)
   - Configure OTP policies
   - Set up WebAuthn

3. **Email Settings**:

   - Configure SMTP server
   - Set up email templates
   - Enable email verification

4. **Events**:
   - Enable event logging
   - Configure event listeners
   - Set up admin events

## Customization

### Adding New Clients

1. Login to Keycloak Admin Console
2. Go to Clients → Create client
3. Configure client settings
4. Export realm to update `realm-export.json`

### Adding Users

For development, you can add users to `realm-export.json`:

```json
{
  "users": [
    {
      "username": "newuser",
      "enabled": true,
      "email": "newuser@example.com",
      "emailVerified": true,
      "firstName": "New",
      "lastName": "User",
      "credentials": [
        {
          "type": "password",
          "value": "password123",
          "temporary": false
        }
      ]
    }
  ]
}
```

For production, create users through:

- Admin Console
- User registration
- Identity providers (LDAP, SAML, etc.)

### Configuring Scopes

To modify client scopes:

1. Go to Client Scopes
2. Create or modify scopes
3. Add protocol mappers
4. Assign to clients

### Identity Providers

To add external identity providers (Google, GitHub, etc.):

1. Go to Identity Providers
2. Add provider
3. Configure OAuth/OIDC settings
4. Map attributes

## Troubleshooting

### Import Failed

If realm import fails:

1. Check Keycloak logs:

   ```bash
   docker logs <keycloak-container>
   ```

2. Verify JSON syntax:

   ```bash
   cat realm-export.json | jq .
   ```

3. Check file permissions:
   ```bash
   ls -la keycloak/realm-export.json
   ```

### Client Not Found

If the client doesn't appear after import:

1. Verify the realm is selected (top left dropdown)
2. Check if import completed successfully in logs
3. Try manual import through Admin Console

### Invalid Redirect URI

If you get "Invalid redirect URI" errors:

1. Check client redirect URIs in Admin Console
2. Ensure URLs match exactly (including trailing slashes)
3. Add wildcard: `http://localhost:3000/*`

## References

- [Keycloak Documentation](https://www.keycloak.org/documentation)
- [Server Administration Guide](https://www.keycloak.org/docs/latest/server_admin/)
- [Securing Applications Guide](https://www.keycloak.org/docs/latest/securing_apps/)
