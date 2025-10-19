import { NextRequest } from "next/server";
import { getKeycloakClient } from "@/lib/auth/keycloak-client";
import { GetStorage } from "@/lib/auth/token-vault-factory";
import { makeResponse, makeVaultError, throwError } from "@/lib/auth/response";
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

/**
 * Handles the GET request for the offline callback endpoint.
 * This endpoint is responsible for processing the authorization code
 * and exchanging it for an offline token from Keycloak. The offline token
 * is then stored in the vault for future use.
 *
 * @param request - The incoming HTTP request object of type `NextRequest`.
 *
 * @returns A response indicating the result of the operation. This could be:
 * - A success response with the session state if the offline token is successfully stored.
 * - An error response if any step in the process fails.
 *
 * The function performs the following steps:
 * 1. Extracts query parameters (`code`, `state`, `error`, `error_description`) from the request.
 * 2. Handles errors returned by Keycloak during the consent flow.
 * 3. Validates the presence of the `code` and `state` parameters.
 * 4. Parses and validates the state token.
 * 5. Retrieves the pending offline token request from the vault using the state token.
 * 6. Exchanges the authorization code for an offline token with Keycloak.
 * 7. Validates the token response and ensures a refresh token is present.
 * 8. Updates the vault with the new offline token and its status.
 * 9. Optionally updates a task in the in-memory task database with the token status.
 * 10. Handles errors gracefully, ensuring the vault and task database are updated appropriately.
 *
 * @throws {AuthManagerError} If any validation or processing step fails.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const ackState = searchParams.get("state");
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

    if (!code || !ackState) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.invalid_request.code, {
          reason: "Missing code or state parameter",
        })
      );
    }

    const statePayload = parseAckState(ackState);
    if (!statePayload) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.invalid_request.code, {
          reason: "Invalid state token",
        })
      );
    }

    const vault = GetStorage();
    const entry = await vault.getByAckState(ackState);

    if (!entry) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.token_not_found.code, {
          reason: "Pending offline token request not found",
          stateToken: ackState,
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

      console.log(
        "Offline token successfully stored:",
        statePayload.persistentTokenId
      );

      // TODO: delete this extra tasks tests
      try {
        const { getTaskDB } = await import("@/lib/task-manager/in-memory-db");
        const taskDB = getTaskDB();
        const task = taskDB.get(statePayload.taskId);

        if (task) {
          taskDB.update(statePayload.taskId, {
            offlineTokenStatus: "active",
          });
          console.log("Task updated with active token status");
        }
      } catch (error) {
        console.error("Error updating task:", error);
        // Don't fail the whole request if task update fails
      }

      // return makeResponse({
      //   session_state: tokenSchemed.session_state,
      // });
      // TODO: here should call TaskManager API to update the task with the persistentTokenId
      // TODO: ask JDC where to redirect after callback finished
      // TODO: (it should be a new page that tells the user you can close this window or error happen)
      // TODO: (this should be some task or activity page)
      // Simulate calling the access token endpoint
      const persistTaskUrl = `${process.env.NEXTAUTH_URL}/api/tasks/${statePayload.taskId}/link-persistent-id`;
      const persistResponse = await fetch(persistTaskUrl, {
        method: "post",
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ persistentTokenId: entry.id }),
      });

      if (!persistResponse.ok) {
        console.log("———persistent is failed", await persistResponse.text());
        throw new Error(
          `Failed to get access token: ${persistResponse.statusText}`
        );
      }
      console.log("———persistent id saved", await persistResponse.json());
      return Response.redirect(
        `${process.env.NEXTAUTH_URL}/tasks?success=true&taskId=${statePayload.taskId}&persistentTokenId=${entry.id}`
      );
    } catch (error: any) {
      console.error("Error exchanging code for offline token:", error);
      await vault.updateOfflineTokenByState(
        ackState,
        null,
        OfflineTokenStatusDict.Failed
      );
      // TODO: delete this task integration for tests
      try {
        const { getTaskDB } = await import("@/lib/task-manager/in-memory-db");
        const taskDB = getTaskDB();
        taskDB.update(statePayload.taskId, {
          offlineTokenStatus: "failed",
        });
      } catch (error) {
        console.error("Error updating task:", error);
      }

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
