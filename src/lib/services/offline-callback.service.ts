import "server-only";

import { getKeycloakClient } from "@/lib/auth/keycloak-client";
import { GetStorage } from "@/lib/auth/token-vault-factory";
import {
  AuthManagerError,
  AuthManagerErrorDict,
} from "@/lib/auth/vault-errors";
import { parseAckState } from "@/lib/auth/state-token";
import { OfflineTokenStatusDict } from "@/lib/auth/token-vault-interface";
import {
  KeycloakContentType,
  TokenResponseSchema,
} from "@/lib/auth/keycloak-schemas";
import logger, { AuthLogEventDict } from "@/lib/logger";

export interface HandleOfflineCallbackParams {
  code: string;
  ackState: string;
}

export interface HandleOfflineCallbackResult {
  persistentTokenId: string;
  sessionState: string;
  userId: string;
}

/**
 * Handles the OAuth callback after user grants offline_access consent.
 *
 * This function:
 * 1. Validates the state token
 * 2. Retrieves the pending offline token entry from the vault
 * 3. Exchanges the authorization code with Keycloak for an offline token
 * 4. Validates the token response
 * 5. Updates the vault with the offline token and marks it as active
 * 6. Optionally updates the task database
 * 7. Links the persistent token ID to the task
 * 8. Returns information for redirect
 *
 * @param params - The parameters from the OAuth callback
 * @returns A promise that resolves to the callback result
 *
 * @throws {AuthManagerError} With code:
 *   - `invalid_request` - If state token is invalid or missing
 *   - `token_not_found` - If pending token entry not found
 *   - `invalid_request` - If state token mismatch
 *   - `keycloak_error` - If token exchange fails
 */
export async function handleOfflineCallback(
  params: HandleOfflineCallbackParams
): Promise<HandleOfflineCallbackResult> {
  const { code, ackState } = params;
  console.log("–– – handleOfflineCallback – code, ackState––", code, ackState);

  logger.keycloak(
    `[${AuthLogEventDict.offlineTokenGranted}] Processing callback`,
    {
      component: "OfflineCallbackService",
      operation: "handleOfflineCallback",
    }
  );

  const statePayload = parseAckState(ackState);
  console.log("–– – handleOfflineCallback – statePayload––", statePayload);
  if (!statePayload) {
    throw new AuthManagerError(AuthManagerErrorDict.invalid_request.code, {
      reason: "Invalid state token",
    });
  }

  const vault = GetStorage();
  const entry = await vault.retrieveByAckState(ackState);

  if (!entry) {
    throw new AuthManagerError(AuthManagerErrorDict.token_not_found.code, {
      reason: "Pending offline token request not found",
      stateToken: ackState,
    });
  }

  if (entry.id !== statePayload.persistentTokenId) {
    throw new AuthManagerError(AuthManagerErrorDict.invalid_request.code, {
      reason: "State token mismatch",
    });
  }

  try {
    const keycloakClient = getKeycloakClient();
    const response = await fetch(keycloakClient.conf.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": KeycloakContentType,
      },
      body: new URLSearchParams({
        code,
        client_id: process.env.KEYCLOAK_CLIENT_ID!,
        client_secret: process.env.KEYCLOAK_CLIENT_SECRET!,
        grant_type: "authorization_code",
        redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/manager/offline-callback`,
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
    const {
      data: tokenSchemed,
      success,
      error: tokenSchemedError,
    } = await TokenResponseSchema.safeParseAsync(result);

    if (!success || !tokenSchemed) {
      throw tokenSchemedError;
    }

    if (!tokenSchemed.refresh_token) {
      throw new Error("No refresh token received from Keycloak");
    }

    await vault.updateOfflineTokenByState(
      ackState,
      tokenSchemed.refresh_token,
      OfflineTokenStatusDict.Active,
      tokenSchemed.session_state
    );

    return {
      persistentTokenId: entry.id,
      sessionState: tokenSchemed.session_state!,
      userId: entry.userId || statePayload.userId,
    };
  } catch (error: any) {
    await vault.updateOfflineTokenByState(
      ackState,
      null,
      OfflineTokenStatusDict.Failed
    );

    logger.error(`[${AuthLogEventDict.keycloakError}] Token exchange failed`, {
      component: "OfflineCallbackService",
      operation: "handleOfflineCallback",
      error: error instanceof Error ? error.message : String(error),
    });

    throw new AuthManagerError(AuthManagerErrorDict.keycloak_error.code, {
      reason: "Failed to exchange authorization code for offline token",
      originalError: error,
    });
  }
}
