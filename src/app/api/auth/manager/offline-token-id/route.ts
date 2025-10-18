import { NextRequest } from "next/server";
import { z } from "zod";
import { getKeycloakClient } from "@/lib/auth/keycloak-client";
import { GetStorage } from "@/lib/auth/token-vault-factory";
import { decryptToken } from "@/lib/auth/encryption";
import { validateRequest } from "@/lib/auth/validate-token";
import { VaultTokenTypeDict } from "@/lib/auth/token-vault-interface";
import { makeResponse, makeVaultError, throwError } from "@/lib/auth/response";
import { getExpirationDate, TokenExpirationDict } from "@/lib/auth/date-utils";
import {
  AuthManagerError,
  AuthManagerErrorDict,
} from "@/lib/auth/vault-errors";

/**
 * POST /api/auth/manager/offline-token-id
 *
 * Requests an offline token from Keycloak and returns a persistent token ID.
 *
 * Note: If user consent is required, this endpoint will fail with a keycloak_error.
 * Users should first call POST /api/auth/manager/offline-consent to get the consent URL,
 * grant consent, and then retry this endpoint.
 *
 * (do not use it)
 * @deprecated
 */
export async function GET(request: NextRequest) {
  try {
    const validation = await validateRequest(request);

    if (!validation.valid) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.unauthorized.code)
      );
    }
    const store = GetStorage();
    const keycloakClient = getKeycloakClient();
    const userTokens = await store.getUserTokens(validation.userId);

    const refreshTokenEntry = userTokens.find(
      (t) => t.tokenType === VaultTokenTypeDict.Refresh
    );

    if (!refreshTokenEntry) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.no_refresh_token.code, {
          userId: validation.userId,
        })
      );
    }

    if (!refreshTokenEntry.encryptedToken || !refreshTokenEntry.iv) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.no_refresh_token.code, {
          userId: validation.userId,
          reason: "Refresh token is pending or not available",
        })
      );
    }

    const refreshToken = decryptToken(
      refreshTokenEntry.encryptedToken,
      refreshTokenEntry.iv
    );

    try {
      const offlineTokenResponse = await keycloakClient.requestOfflineToken(
        refreshToken
      );

      if (offlineTokenResponse.refresh_token) {
        const expiresAt = getExpirationDate(TokenExpirationDict.offline);

        const persistentTokenId = await store.create(
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

        return makeResponse({
          persistentTokenId,
          expiresAt: expiresAt.toISOString(),
        });
      }

      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.keycloak_error.code, {
          userId: validation.userId,
        })
      );
    } catch (error: any) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.keycloak_error.code, {
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
 * DELETE /api/auth/manager/offline-token-id
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

    if (!validation.valid) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.unauthorized.code)
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
        new AuthManagerError(AuthManagerErrorDict.token_not_found.code, {
          persistentTokenId,
        })
      );
    }

    // Verify the token belongs to the authenticated user
    if (tokenEntry.userId !== validation.userId) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.forbidden.code, {
          userId: validation.userId,
          persistentTokenId,
        })
      );
    }

    // Only allow revoking offline tokens (not refresh tokens)
    if (tokenEntry.tokenType !== VaultTokenTypeDict.Offline) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.invalid_token_type.code, {
          persistentTokenId,
        })
      );
    }

    // Check if token is available (not pending)
    if (!tokenEntry.encryptedToken || !tokenEntry.iv) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.invalid_token_type.code, {
          persistentTokenId,
          reason: "Token is pending and cannot be revoked yet",
        })
      );
    }

    // Decrypt the token
    const token = decryptToken(tokenEntry.encryptedToken, tokenEntry.iv);

    // Get Keycloak client
    const keycloakClient = getKeycloakClient();

    // Revoke token in Keycloak
    try {
      await keycloakClient.revoke(token);
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
