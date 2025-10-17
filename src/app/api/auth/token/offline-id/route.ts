import { NextRequest } from "next/server";
import { z } from "zod";
import { getKeycloakClient } from "@/lib/auth/keycloak-client";
import { GetStorage } from "@/lib/auth/token-vault-factory";
import { decryptToken } from "@/lib/auth/encryption";
import { validateRequest } from "@/lib/auth/validate-token";
import { VaultTokenTypeDict } from "@/lib/auth/token-vault-interface";
import { makeResponse, makeVaultError, throwError } from "@/lib/auth/response";
import { getExpirationDate, TokenExpirationDict } from "@/lib/auth/date-utils";
import { VaultError, VaultErrorCodeDict } from "@/lib/auth/vault-errors";

// Request schema
const OfflineTokenRequestSchema = z.object({
  redirectUri: z.string().url().optional(),
});

/**
 * POST /api/auth/token/offline-id
 *
 * Requests an offline token from Keycloak and returns a persistent token ID.
 * If user consent is required, returns a consent URL instead.
 *
 * Requirements: 9.2, 5.1, 5.2, 5.3
 */
export async function POST(request: NextRequest) {
  try {
    // Validate Bearer token from Authorization header
    const validation = await validateRequest(request);

    if (!validation.valid || !validation.userId) {
      return makeVaultError(
        new VaultError(VaultErrorCodeDict.unauthorized, {
          userId: validation.userId,
        })
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedBody = OfflineTokenRequestSchema.parse(body);

    // Initialize Keycloak client
    const keycloakClient = getKeycloakClient();

    // Get the user's refresh token from the vault
    const vault = GetStorage();
    const userTokens = await vault.getUserTokens(validation.userId);

    // Find the refresh token (not offline token)
    const refreshTokenEntry = userTokens.find(
      (t) => t.tokenType === VaultTokenTypeDict.Refresh
    );

    if (!refreshTokenEntry) {
      return makeVaultError(
        new VaultError(VaultErrorCodeDict.no_refresh_token, {
          userId: validation.userId,
        })
      );
    }

    // Decrypt the refresh token
    const refreshToken = decryptToken(
      refreshTokenEntry.encryptedToken,
      refreshTokenEntry.iv
    );

    // Request offline token from Keycloak by exchanging the refresh token
    try {
      const offlineTokenResponse = await keycloakClient.requestOfflineToken(
        refreshToken
      );

      // If we have an offline token, store it in the vault
      if (offlineTokenResponse.refresh_token) {
        const tokenVault = GetStorage();

        // Calculate expiration for offline tokens
        const expiresAt = getExpirationDate(TokenExpirationDict.offline);

        const persistentTokenId = await tokenVault.store(
          validation.userId,
          offlineTokenResponse.refresh_token,
          VaultTokenTypeDict.Offline,
          expiresAt,
          {
            email: validation.email,
            username: validation.username,
            createdVia: "offline_token_request",
          }
        );

        console.log("offline token stored in vault:", persistentTokenId);

        return makeResponse({
          persistentTokenId,
          expiresAt: expiresAt.toISOString(),
        });
      }

      // Unexpected response
      return makeVaultError(
        new VaultError(VaultErrorCodeDict.keycloak_error, {
          userId: validation.userId,
        })
      );
    } catch (error: any) {
      console.error("error requesting offline token:", error);

      // Check if it's a consent required error
      if (
        error.error === "consent_required" ||
        error.error_description?.includes("consent")
      ) {
        // Build consent URL
        const consentUrl =
          `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/auth?` +
          `client_id=${process.env.KEYCLOAK_CLIENT_ID}` +
          `&response_type=code` +
          `&scope=openid offline_access` +
          `&redirect_uri=${encodeURIComponent(
            validatedBody.redirectUri ||
              `${process.env.NEXTAUTH_URL}/api/auth/callback/keycloak`
          )}`;

        return makeResponse({ consentUrl });
      }

      return makeVaultError(
        new VaultError(VaultErrorCodeDict.keycloak_error, {
          userId: validation.userId,
          originalError: error,
        })
      );
    }
  } catch (error) {
    return throwError(error);
  }
}

/**
 * DELETE /api/auth/token/offline-id
 *
 * Revokes an offline token by:
 * 1. Retrieving it from the vault
 * 2. Revoking it in Keycloak
 * 3. Deleting it from the vault
 *
 * Requirements: 9.4, 7.1, 7.2, 7.3, 7.4, 7.5
 */
export async function DELETE(request: NextRequest) {
  try {
    // Validate Bearer token from Authorization header
    const validation = await validateRequest(request);

    if (!validation.valid || !validation.userId) {
      return makeVaultError(
        new VaultError(VaultErrorCodeDict.unauthorized, {
          userId: validation.userId,
        })
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const RevokeTokenRequestSchema = z.object({
      persistentTokenId: z.string().uuid(),
    });
    const { persistentTokenId } = RevokeTokenRequestSchema.parse(body);

    // Retrieve token from vault
    const tokenVault = GetStorage();
    const tokenEntry = await tokenVault.retrieve(persistentTokenId);

    if (!tokenEntry) {
      return makeVaultError(
        new VaultError(VaultErrorCodeDict.token_not_found, {
          persistentTokenId,
        })
      );
    }

    // Verify the token belongs to the authenticated user
    if (tokenEntry.userId !== validation.userId) {
      return makeVaultError(
        new VaultError(VaultErrorCodeDict.forbidden, {
          userId: validation.userId,
          persistentTokenId,
        })
      );
    }

    // Only allow revoking offline tokens (not refresh tokens)
    if (tokenEntry.tokenType !== VaultTokenTypeDict.Offline) {
      return makeVaultError(
        new VaultError(VaultErrorCodeDict.invalid_token_type, {
          persistentTokenId,
        })
      );
    }

    // Decrypt the token
    const token = decryptToken(tokenEntry.encryptedToken, tokenEntry.iv);

    // Get Keycloak client
    const keycloakClient = getKeycloakClient();

    // Revoke token in Keycloak
    try {
      await keycloakClient.revokeToken(token);
      console.log("Offline token revoked in Keycloak:", persistentTokenId);
    } catch (error) {
      console.error("Error revoking token in Keycloak:", error);
      // Continue to delete from vault even if Keycloak revocation fails
    }

    // Delete from vault
    await tokenVault.delete(persistentTokenId);
    console.log("token deleted from vault:", persistentTokenId);

    return makeResponse({
      success: true,
      message: "offline token revoked successfully",
    });
  } catch (error) {
    return throwError(error);
  }
}
