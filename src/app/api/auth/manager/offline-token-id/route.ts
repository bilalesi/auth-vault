import { NextRequest } from "next/server";
import z from "zod";

import { AuthManagerTokenTypeDict } from "@/services/auth-manager/auth/token-vault-interface";
import { revokeOfflineToken } from "@/services/auth-manager/use-cases/revoke-offline-token";
import { GetKeycloakClient } from "@/services/auth-manager/auth/keycloak-client";
import { GetStorage } from "@/services/auth-manager/auth/token-vault-factory";
import { validateRequest } from "@/services/auth-manager/auth/validate-token";
import { decryptToken } from "@/services/auth-manager/auth/encryption";
import {
  AuthManagerError,
  AuthManagerErrorDict,
} from "@/services/auth-manager/auth/vault-errors";
import {
  makeAuthManagerError,
  makeAuthManagerErrorResponse,
  makeAuthManagerOkResponse,
} from "@/services/auth-manager/auth/response";

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequest(request);

    if (!validation.valid) {
      return makeAuthManagerError(
        new AuthManagerError(AuthManagerErrorDict.unauthorized.code, {
          reason: "Token is not valid",
        })
      );
    }

    if (!validation.sessionId) {
      return makeAuthManagerError(
        new AuthManagerError(AuthManagerErrorDict.unauthorized.code, {
          reason: "No session id was found",
        })
      );
    }

    const storage = GetStorage();
    const client = GetKeycloakClient();
    const entry = await storage.retrieveUserPersistentIdBySession(
      validation.sessionId
    );
    console.log("–– – POST – entry––", entry);

    if (!entry || !entry.encryptedToken || !entry.iv) {
      return makeAuthManagerError(
        new AuthManagerError(AuthManagerErrorDict.token_not_found.code, {
          reason: "No offline token was found to generate a new one",
        })
      );
    }

    const decryptedToken = decryptToken(entry.encryptedToken, entry.iv);
    const newOfflineToken = await client.requestOfflineToken(decryptedToken);

    if (!newOfflineToken || !newOfflineToken.refresh_token) {
      return makeAuthManagerError(
        new AuthManagerError(AuthManagerErrorDict.token_not_found.code, {
          reason: "Could not generate new token",
        })
      );
    }

    const newEntry = await storage.create({
      userId: validation.userId,
      sessionStateId: newOfflineToken.session_state,
      token: newOfflineToken.refresh_token,
      type: AuthManagerTokenTypeDict.Offline,
      metadata: {
        from: entry.id,
      },
    });

    return makeAuthManagerOkResponse({
      persistentTokenId: newEntry.id,
      sessionId: newEntry.sessionStateId,
    });
  } catch (error) {
    return makeAuthManagerErrorResponse(error);
  }
}

/**
 * Handles the DELETE request to revoke an offline token.
 *
 * @param request - The incoming HTTP request of type `NextRequest`.
 * @returns A response indicating the result of the operation:
 * - If the request is invalid, an unauthorized error response is returned.
 * - If the token revocation is successful, an OK response with the result is returned.
 * - If an error occurs during processing, an error response is returned.
 *
 * @throws Will propagate any unexpected errors encountered during the operation.
 */
export async function DELETE(request: NextRequest) {
  try {
    const validation = await validateRequest(request);

    if (!validation.valid) {
      return makeAuthManagerError(
        new AuthManagerError(AuthManagerErrorDict.unauthorized.code)
      );
    }
    const searchParams = request.nextUrl.searchParams;
    const id = await z.string().uuid().parseAsync(searchParams.get("id"));

    const result = await revokeOfflineToken({
      sessionStateId: validation.sessionId,
      id,
    });

    return makeAuthManagerOkResponse(result);
  } catch (error) {
    return makeAuthManagerErrorResponse(error);
  }
}
