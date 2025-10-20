import { z } from "zod";
import { getKeycloakClient } from "@/lib/auth/keycloak-client";
import { GetStorage } from "@/lib/auth/token-vault-factory";
import { AuthManagerTokenTypeDict } from "@/lib/auth/token-vault-interface";
import {
  AuthManagerError,
  AuthManagerErrorDict,
} from "@/lib/auth/vault-errors";
import { logger, AuthLogEventDict } from "@/lib/logger";

export interface RevokeOfflineTokenParams {
  userId: string;
  persistentTokenId: string;
}

export interface RevokeOfflineTokenResult {
  success: boolean;
  message: string;
  sessionRevoked: boolean;
  tokensWithSameSession: number;
}

const RevokeTokenRequestSchema = z.object({
  persistent_token_id: z.uuid(),
});

/**
 * Revokes an offline token and optionally revokes the Keycloak session.
 *
 * This function performs the following steps:
 * 1. Validates the request body schema
 * 2. Retrieves the token from storage
 * 3. Validates token ownership and type
 * 4. Checks for other tokens with the same session_state
 * 5. Deletes the token from storage
 * 6. If it's the last token for the session, revokes the Keycloak session
 *
 * @param params - Object containing userId and persistentTokenId
 * @param body - Request body containing persistent_token_id
 * @returns Object with success status, message, and session revocation details
 * @throws {AuthManagerError} If validation fails or token is invalid
 */
export async function revokeOfflineToken(
  params: RevokeOfflineTokenParams,
  body: unknown
): Promise<RevokeOfflineTokenResult> {
  const { userId } = params;

  const { persistent_token_id: persistentTokenId } =
    RevokeTokenRequestSchema.parse(body);

  const store = GetStorage();
  const entry = await store.retrieve(persistentTokenId);

  if (!entry) {
    throw new AuthManagerError(AuthManagerErrorDict.token_not_found.code, {
      persistentTokenId,
    });
  }

  if (entry.userId !== userId) {
    throw new AuthManagerError(AuthManagerErrorDict.unauthorized.code, {
      reason: "User does not own this token",
      persistentTokenId,
    });
  }

  if (entry.tokenType !== AuthManagerTokenTypeDict.Offline) {
    throw new AuthManagerError(AuthManagerErrorDict.invalid_token_type.code, {
      persistentTokenId,
      reason: "Only offline tokens can be revoked via this endpoint",
    });
  }

  if (!entry.encryptedToken || !entry.iv) {
    throw new AuthManagerError(AuthManagerErrorDict.invalid_token_type.code, {
      persistentTokenId,
      reason: "Token is pending and cannot be revoked yet",
    });
  }

  if (!entry.sessionState) {
    throw new AuthManagerError(AuthManagerErrorDict.invalid_token_type.code, {
      persistentTokenId,
      reason: "Token does not have a session_state",
    });
  }

  const otherTokensWithSameSession = await store.retrieveBySessionState(
    entry.sessionState,
    persistentTokenId
  );

  logger.api(AuthLogEventDict.offlineTokenRevoked, {
    component: "RevokeOfflineTokenService",
    operation: "checkSessionTokens",
    userId,
    persistentTokenId,
    sessionState: entry.sessionState,
    tokensWithSameSession: otherTokensWithSameSession.length,
  });

  await store.delete(persistentTokenId);

  let sessionRevoked = false;

  if (!otherTokensWithSameSession.length) {
    const keycloakClient = getKeycloakClient();
    try {
      await keycloakClient.revokeSession(entry.sessionState);
      sessionRevoked = true;
      logger.api(AuthLogEventDict.offlineTokenRevoked, {
        component: "RevokeOfflineTokenService",
        operation: "revokeSession",
        userId,
        sessionState: entry.sessionState,
        persistentTokenId,
      });
    } catch (err) {
      logger.api(
        AuthLogEventDict.keycloakError,
        {
          component: "RevokeOfflineTokenService",
          operation: "revokeSession",
          userId,
          sessionState: entry.sessionState,
        },
        err
      );
    }
  } else {
    logger.api(AuthLogEventDict.offlineTokenRevoked, {
      component: "RevokeOfflineTokenService",
      operation: "skipSessionRevoke",
      userId,
      sessionState: entry.sessionState,
      tokensRemaining: otherTokensWithSameSession.length,
    });
  }

  return {
    success: true,
    message: sessionRevoked
      ? "Offline token deleted and session revoked successfully"
      : "Offline token deleted successfully (session still active)",
    sessionRevoked,
    tokensWithSameSession: otherTokensWithSameSession.length,
  };
}
