import "server-only";

import {
  AuthManagerError,
  AuthManagerErrorDict,
} from "@/services/auth-manager/auth/vault-errors";
import { AuthManagerTokenTypeDict } from "@/services/auth-manager/auth/token-vault-interface";
import { GetKeycloakClient } from "@/services/auth-manager/auth/keycloak-client";
import { GetStorage } from "@/services/auth-manager/auth/token-vault-factory";
import { AuthLogEventDict, logger } from "@/services/auth-manager/logger";
import {
  KeycloakContentType,
  TokenResponseSchema,
} from "@/services/auth-manager/auth/keycloak-schemas";

export interface HandleOfflineCallbackParams {
  code: string;
  userId: string;
}

export interface HandleOfflineCallbackResult {
  persistentTokenId: string;
  sessionStateId: string;
}

/**
 * Handles the offline callback process for exchanging an authorization code
 * with Keycloak to obtain a refresh token and update the offline token storage.
 *
 * @param params - The parameters required for handling the offline callback.
 * @param params.code - The authorization code received from Keycloak.
 * @param params.persistentTokenId - The identifier for the persistent token entry.
 *
 * @returns A promise that resolves to the result of the offline callback process,
 * including the persistent token ID and session state.
 *
 * @throws {AuthManagerError} If the persistent token ID is invalid, the token
 * request is not found, or the token exchange process fails.
 *
 * @throws {Error} If the response from Keycloak is invalid or does not contain
 * the required refresh token.
 */
export async function makeOfflineTokenThroughCallback(
  params: HandleOfflineCallbackParams
): Promise<HandleOfflineCallbackResult> {
  const { code, userId } = params;

  logger.keycloak("Processing consent callback", {
    params,
  });

  const storage = GetStorage();

  try {
    const keycloakClient = GetKeycloakClient();
    const response = await fetch(keycloakClient.conf.tokenEndpoint, {
      method: "post",
      headers: {
        "Content-Type": KeycloakContentType,
      },
      body: new URLSearchParams({
        code,
        client_id: process.env.KEYCLOAK_CLIENT_ID!,
        client_secret: process.env.KEYCLOAK_CLIENT_SECRET!,
        grant_type: "authorization_code",
        redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/manager/offline-token/callback`,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `Token exchange failed: ${
          errorData.error_description || errorData.error
        }`
      );
    }

    const result = await response.json();

    const { refresh_token: refreshToken, session_state: sessionStateId } =
      await TokenResponseSchema.parseAsync(result);

    if (!refreshToken) {
      throw new Error("No refresh token received from Keycloak");
    }
    if (!sessionStateId) {
      throw new Error("No session state received from Keycloak");
    }

    const entry = await storage.create({
      token: refreshToken,
      type: AuthManagerTokenTypeDict.Offline,
      sessionStateId,
      userId,
    });

    return {
      persistentTokenId: entry.id,
      sessionStateId: sessionStateId!,
    };
  } catch (error: any) {
    logger.error(`Token exchange failed`, {
      reason: error instanceof Error ? error.message : String(error),
    });
    if (AuthManagerError.is(error)) {
      throw error;
    }
    throw new AuthManagerError(AuthManagerErrorDict.keycloak_error.code, {
      reason: "Failed to exchange authorization code for offline token",
      originalError: error,
    });
  }
}
