import "server-only";

import {
  AuthManagerError,
  AuthManagerErrorDict,
} from "@/services/auth-manager/auth/vault-errors";
import { GetKeycloakClient } from "@/services/auth-manager/auth/keycloak-client";
import { GetStorage } from "@/services/auth-manager/auth/token-vault-factory";
import { decryptToken } from "@/services/auth-manager/auth/encryption";
import { logger } from "@/services/auth-manager/logger";

export interface GetAccessTokenParams {
  persistentTokenId: string;
  userId?: string;
}

export interface GetAccessTokenResult {
  accessToken: string;
  expiresIn: number;
}

/**
 * Retrieves an access token using the provided persistent token ID.
 *
 * This function fetches a stored token entry from the storage system, decrypts it,
 * and uses it to refresh the access token via the Keycloak client. If a new refresh
 * token is provided in the response, it updates the storage with the new token.
 *
 * @param params - The parameters required to retrieve the access token.
 * @param params.persistentTokenId - The unique identifier for the persistent token.
 *
 * @returns A promise that resolves to an object containing the access token and its expiration time.
 *
 * @throws {AuthManagerError} If the token entry is not found, is invalid, or is not active.
 */
export async function makeAccessToken(
  params: GetAccessTokenParams
): Promise<GetAccessTokenResult> {
  const { persistentTokenId } = params;

  logger.vault(`Retrieving token`, {
    persistentTokenId,
  });

  const storage = GetStorage();
  const entry = await storage.retrieve(persistentTokenId);
  console.log("–– – makeAccessToken – entry––", entry);

  if (!entry) {
    throw new AuthManagerError(AuthManagerErrorDict.token_not_found.code, {
      persistentTokenId,
    });
  }

  if (!entry.encryptedToken || !entry.iv) {
    throw new AuthManagerError(AuthManagerErrorDict.token_not_found.code, {
      reason: "Token is pending or not available",
      persistentTokenId,
    });
  }

  const keycloakClient = GetKeycloakClient();
  const token = decryptToken(entry.encryptedToken, entry.iv);
  const response = await keycloakClient.refreshAccessToken(token);

  // this will update the refresh token of the session
  if (response.refresh_token) {
    await storage.upsertRefreshToken({
      userId: entry.userId,
      token: response.refresh_token,
      sessionStateId: response.session_state,
      metadata: {
        ...entry.metadata,
      },
    });

    logger.vault("Updated refresh token", {
      persistentTokenId,
      userId: entry.userId,
      tokenType: entry.tokenType,
    });
  }

  logger.api("Access token retrieved", {
    persistentTokenId,
    userId: entry.userId,
    expiresIn: response.expires_in,
  });

  return {
    accessToken: response.access_token,
    expiresIn: response.expires_in,
  };
}
