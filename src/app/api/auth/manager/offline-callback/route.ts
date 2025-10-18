import { NextRequest } from "next/server";
import { getKeycloakClient } from "@/lib/auth/keycloak-client";
import { GetStorage } from "@/lib/auth/token-vault-factory";
import { makeResponse, makeVaultError, throwError } from "@/lib/auth/response";
import {
  AuthManagerError,
  AuthManagerErrorDict,
} from "@/lib/auth/vault-errors";
import { parseStateToken } from "@/lib/auth/state-token";
import { OfflineTokenStatusDict } from "@/lib/auth/token-vault-interface";

/**
 * GET /api/auth/manager/offline-callback
 *
 * OAuth callback handler for offline token consent flow.
 * This endpoint is called by Keycloak after the user grants consent.
 * It exchanges the authorization code for an offline token and updates the pending request.
 *
 * Query parameters:
 * - code: Authorization code from Keycloak
 * - state: State token containing userId, taskId, and persistentTokenId
 * - error: Error code if consent was denied
 * - error_description: Error description
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    if (error) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.keycloak_error.code, {
          reason: `Consent flow failed: ${errorDescription || error}`,
          keycloakError: error,
        })
      );
    }

    if (!code || !state) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.invalid_request.code, {
          reason: "Missing code or state parameter",
        })
      );
    }

    const statePayload = parseStateToken(state);
    if (!statePayload) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.invalid_request.code, {
          reason: "Invalid state token",
        })
      );
    }

    const vault = GetStorage();
    const entry = await vault.getByStateToken(state);

    if (!entry) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.token_not_found.code, {
          reason: "Pending offline token request not found",
          stateToken: state,
        })
      );
    }

    if (entry.id !== statePayload.persistentTokenId) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.invalid_request.code, {
          reason: "State token mismatch",
        })
      );
    }

    try {
      const keycloakClient = getKeycloakClient();
      const response = await fetch(keycloakClient.conf.tokenEndpoint, {
        method: "post",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
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

      const tokens = await response.json();

      // Check if we got an offline token (refresh_token with offline_access scope)
      if (!tokens.refresh_token) {
        throw new Error("No refresh token received from Keycloak");
      }

      // Update the pending token with the actual offline token
      await vault.updateOfflineTokenByState(
        state,
        tokens.refresh_token,
        OfflineTokenStatusDict.Active
      );

      console.log(
        "Offline token successfully stored:",
        statePayload.persistentTokenId
      );

      return makeResponse({
        success: true,
        persistentTokenId: statePayload.persistentTokenId,
        taskId: statePayload.taskId,
        message: "Offline token successfully obtained and stored",
      });
    } catch (error: any) {
      console.error("Error exchanging code for offline token:", error);

      // Mark the request as failed
      await vault.updateOfflineTokenByState(
        state,
        null,
        OfflineTokenStatusDict.Failed
      );

      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.keycloak_error.code, {
          reason: "Failed to exchange authorization code for offline token",
          originalError: error,
        })
      );
    }
  } catch (error) {
    return throwError(error);
  }
}
