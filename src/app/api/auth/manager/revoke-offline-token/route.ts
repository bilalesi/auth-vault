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

/**
 * POST /api/auth/manager/revoke-offline-token
 *
 * Revokes an offline token by checking if it's the last token with the same session_state.
 * If it's the last one, revokes the entire Keycloak session.
 *
 * @param request - NextRequest containing:
 *   - headers: Authorization with access token
 *   - body: { persistentTokenId: string }
 *
 * @returns Response with:
 *   - success: boolean
 *   - message: string
 *   - sessionRevoked: boolean (true if session was revoked in Keycloak)
 *   - tokensWithSameSession: number (count of tokens with same session_state)
 *
 * @throws {AuthManagerError} If:
 *   - User is not authenticated
 *   - Token not found
 *   - Token is not an offline token
 *   - Token is pending
 *   - User doesn't own the token
 */
export async function POST(request: NextRequest) {
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

    if (entry.userId !== validation.userId) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.unauthorized.code, {
          reason: "User does not own this token",
          persistentTokenId,
        })
      );
    }

    if (entry.tokenType !== AuthManagerTokenTypeDict.Offline) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.invalid_token_type.code, {
          persistentTokenId,
          reason: "Only offline tokens can be revoked via this endpoint",
        })
      );
    }

    if (!entry.encryptedToken || !entry.iv) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.invalid_token_type.code, {
          persistentTokenId,
          reason: "Token is pending and cannot be revoked yet",
        })
      );
    }

    if (!entry.sessionState) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.invalid_token_type.code, {
          persistentTokenId,
          reason: "Token does not have a session_state",
        })
      );
    }

    const otherTokensWithSameSession = await store.retrieveBySessionState(
      entry.sessionState,
      persistentTokenId
    );

    console.log(
      `Found ${otherTokensWithSameSession.length} other token(s) with session_state: ${entry.sessionState}`
    );

    // Delete this token from vault
    await store.delete(persistentTokenId);

    let sessionRevoked = false;
    if (!otherTokensWithSameSession.length) {
      const keycloakClient = getKeycloakClient();
      try {
        await keycloakClient.revokeSession(entry.sessionState);
        sessionRevoked = true;
        console.log(
          "Session revoked in Keycloak (last token):",
          entry.sessionState
        );
      } catch (error) {
        console.error("Error revoking session in Keycloak:", error);
        // Continue even if Keycloak session revoke failed
      }
    } else {
      console.log(
        `Session not revoked (${otherTokensWithSameSession.length} other token(s) still exist):`,
        entry.sessionState
      );
    }

    return makeResponse({
      success: true,
      message: sessionRevoked
        ? "Offline token deleted and session revoked successfully"
        : "Offline token deleted successfully (session still active)",
      sessionRevoked,
      tokensWithSameSession: otherTokensWithSameSession.length,
    });
  } catch (error) {
    return throwError(error);
  }
}

/**
 * Handles the DELETE request to revoke an offline token.
 *
 * This function validates the incoming request, parses the request body,
 * and performs the necessary operations to revoke an offline token. It ensures
 * that only valid offline tokens can be revoked and interacts with the storage
 * and Keycloak client to complete the revocation process.
 *
 * @param request - The incoming HTTP request of type `NextRequest`.
 * @returns A response indicating the success or failure of the revocation operation.
 *
 * ### Error Handling:
 * - Returns an error response if the request validation fails.
 * - Returns an error response if the token is not found in the storage.
 * - Returns an error response if the token type is invalid or the token is pending.
 * - Logs errors if the Keycloak revocation fails but continues the operation.
 *
 * ### Steps:
 * 1. Validates the request using `validateRequest`.
 * 2. Parses the request body to extract the `persistentTokenId`.
 * 3. Retrieves the token entry from the storage.
 * 4. Ensures the token is an offline token and is available for revocation.
 * 5. Deletes the token from the storage.
 * 6. Checks for duplicate token hashes to determine if Keycloak revocation is necessary.
 * 7. Revokes the token in Keycloak if applicable.
 * 8. Returns a success response with details of the operation.
 *
 * ### Response:
 * - `success`: Indicates whether the operation was successful.
 * - `message`: A message describing the result of the operation.
 * - `revoked`: A boolean indicating whether the token was revoked in Keycloak.
 * TODO (check with JDC)
 * @deprecated
 */
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

    if (entry.tokenType !== AuthManagerTokenTypeDict.Offline) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.invalid_token_type.code, {
          persistentTokenId,
        })
      );
    }

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
