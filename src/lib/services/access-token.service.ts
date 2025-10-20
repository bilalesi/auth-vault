import "server-only";

import { GetStorage } from "@/lib/auth/token-vault-factory";
import { getKeycloakClient } from "@/lib/auth/keycloak-client";
import { decryptToken } from "@/lib/auth/encryption";
import {
  AuthManagerError,
  AuthManagerErrorDict,
} from "@/lib/auth/vault-errors";
import { AuthManagerTokenTypeDict } from "@/lib/auth/token-vault-interface";
import {
  isExpired,
  TokenExpirationDict,
  getExpirationDate,
} from "@/lib/auth/date-utils";
import logger, { AuthLogEventDict } from "@/lib/logger";

export interface GetAccessTokenParams {
  persistentTokenId: string;
  userId?: string;
}

export interface GetAccessTokenResult {
  accessToken: string;
  expiresIn: number;
}
/*
 * Retrieves a valid access token for a user by refreshing an existing refresh token.
 *
 * This function performs the following operations:
 * 1. Retrieves the stored refresh token from the vault using the persistent token ID
 * 2. Validates that the token exists and hasn't expired
 * 3. Decrypts the stored refresh token
 * 4. Uses Keycloak client to refresh the access token
 * 5. Updates the vault with a new refresh token if one is returned by Keycloak
 * 6. Returns the new access token and its expiration time
 *
 * @param params - The parameters for retrieving the access token
 * @param params.persistentTokenId - The unique identifier for the stored token
 * @param params.userId - Optional user ID for logging purposes
 *
 * @returns A promise that resolves to an object containing:
 *   - accessToken: The new access token from Keycloak
 *   - expiresIn: The number of seconds until the access token expires
 *
 * @throws {AuthManagerError} When:
 *   - Token is not found in the vault
 *   - Token has expired (also deletes the expired token)
 *   - Token is pending and not yet available (missing encrypted token or IV)
 */
export async function getAccessToken(
  params: GetAccessTokenParams
): Promise<GetAccessTokenResult> {
  const { persistentTokenId, userId } = params;

  logger.vault(`[${AuthLogEventDict.vaultStore}] Retrieving token`, {
    component: "AccessTokenService",
    operation: "getAccessToken",
    persistentTokenId,
    userId,
  });

  const vault = GetStorage();
  const entry = await vault.retrieve(persistentTokenId);

  if (!entry) {
    throw new AuthManagerError(AuthManagerErrorDict.token_not_found.code, {
      persistentTokenId,
    });
  }

  if (isExpired(entry.expiresAt)) {
    await vault.delete(persistentTokenId);
    throw new AuthManagerError(AuthManagerErrorDict.token_expired.code, {
      persistentTokenId,
    });
  }

  if (!entry.encryptedToken || !entry.iv) {
    throw new AuthManagerError(AuthManagerErrorDict.token_not_found.code, {
      persistentTokenId,
      reason: "Token is pending and not yet available",
      status: entry.status,
    });
  }

  const keycloakClient = getKeycloakClient();
  const token = decryptToken(entry.encryptedToken, entry.iv);
  const response = await keycloakClient.refreshAccessToken(token);

  // If Keycloak returns a new refresh token, update the vault
  if (response.refresh_token) {
    const expiresAt =
      entry.tokenType === AuthManagerTokenTypeDict.Offline
        ? getExpirationDate(TokenExpirationDict.Offline)
        : getExpirationDate(TokenExpirationDict.Refresh);

    await vault.create(
      entry.userId,
      response.refresh_token,
      entry.tokenType,
      expiresAt,
      {
        ...entry.metadata,
        updatedAt: new Date().toISOString(),
      },
      persistentTokenId
    );

    logger.vault(`[${AuthLogEventDict.tokenRefreshed}] Updated refresh token`, {
      component: "AccessTokenService",
      operation: "updateRefreshToken",
      persistentTokenId,
      userId: entry.userId,
      tokenType: entry.tokenType,
    });
  }

  logger.api(`[${AuthLogEventDict.tokenCreated}] Access token retrieved`, {
    component: "AccessTokenService",
    operation: "getAccessToken",
    persistentTokenId,
    userId: entry.userId,
    expiresIn: response.expires_in,
  });

  return {
    accessToken: response.access_token,
    expiresIn: response.expires_in,
  };
}
