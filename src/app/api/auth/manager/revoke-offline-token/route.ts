import { NextRequest } from "next/server";
import { z } from "zod";
import { getKeycloakClient } from "@/lib/auth/keycloak-client";
import { GetStorage } from "@/lib/auth/token-vault-factory";
import { decryptToken } from "@/lib/auth/encryption";
import { validateRequest } from "@/lib/auth/validate-token";
import { AuthManagerTokenTypeDict } from "@/lib/auth/token-vault-interface";
import { makeResponse, makeVaultError, throwError } from "@/lib/auth/response";
import { getExpirationDate, TokenExpirationDict } from "@/lib/auth/date-utils";
import {
  AuthManagerError,
  AuthManagerErrorDict,
} from "@/lib/auth/vault-errors";

/**
 * get /api/auth/manager/offline-token-id
 *
 * requests an offline token from Keycloak and returns a persistent token ID.
 *
 * Note: If user consent is required, this endpoint will fail with a keycloak_error.
 * Users should first call POST /api/auth/manager/offline-consent to get the consent URL,
 * grant consent, and then retry this endpoint.
 *
 * (do not use it only after discussion with JDC)
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
    const entry = await store.getUserRefreshToken(validation.userId);

    if (!entry) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.no_refresh_token.code, {
          userId: validation.userId,
        })
      );
    }

    if (!entry.encryptedToken || !entry.iv) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.no_refresh_token.code, {
          userId: validation.userId,
          reason: "Refresh token is pending or not available",
        })
      );
    }

    const refreshToken = decryptToken(entry.encryptedToken, entry.iv);

    try {
      const offlineTokenResponse = await keycloakClient.requestOfflineToken(
        refreshToken
      );

      if (offlineTokenResponse.refresh_token) {
        const expiresAt = getExpirationDate(TokenExpirationDict.Offline);

        const persistentTokenId = await store.create(
          validation.userId,
          offlineTokenResponse.refresh_token,
          AuthManagerTokenTypeDict.Offline,
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

export async function DELETE(request: NextRequest) {
  try {
    const validation = await validateRequest(request);

    if (!validation.valid) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.unauthorized.code)
      );
    }

    const body = await request.json();
    const RevokeTokenRequestSchema = z.object({
      persistentTokenId: z.uuid(),
    });
    const { persistentTokenId } = RevokeTokenRequestSchema.parse(body);

    const store = GetStorage();
    const entry = await store.retrieve(persistentTokenId);

    if (!entry) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.token_not_found.code, {
          persistentTokenId,
        })
      );
    }

    // only allow revoke op for offline tokens (not refresh tokens)
    if (entry.tokenType !== AuthManagerTokenTypeDict.Offline) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.invalid_token_type.code, {
          persistentTokenId,
        })
      );
    }

    // check if token is available (not pending)
    if (!entry.encryptedToken || !entry.iv) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.invalid_token_type.code, {
          persistentTokenId,
          reason: "Token is pending and cannot be revoked yet",
        })
      );
    }

    const token = decryptToken(entry.encryptedToken, entry.iv);
    const keycloakClient = getKeycloakClient();
    await store.delete(persistentTokenId);

    const tokenHash = entry.tokenHash;
    let shouldRevoke = true;

    if (tokenHash) {
      const duplicateFound = await store.retrieveDuplicateTokenHash(
        tokenHash,
        persistentTokenId
      );

      if (duplicateFound) {
        shouldRevoke = false;
        console.log(
          "Token hash found in other entries, skipping Keycloak revocation:",
          persistentTokenId
        );
      }
    }

    if (shouldRevoke) {
      try {
        await keycloakClient.revokeToken(token);
        console.log("Offline token revoked in Keycloak:", persistentTokenId);
      } catch (error) {
        console.error("Error revoking token in Keycloak:", error);
        // Continue even if Keycloak revoke failed
      }
    }

    return makeResponse({
      success: true,
      message: "Offline token deleted successfully",
      revoked: shouldRevoke,
    });
  } catch (error) {
    return throwError(error);
  }
}
