import { NextRequest } from "next/server";
import { GetStorage } from "@/lib/auth/token-vault-factory";
import { validateRequest } from "@/lib/auth/validate-token";
import {
  makeResponse,
  makeAuthManagerError,
  throwError,
} from "@/lib/auth/response";
import {
  AuthManagerError,
  AuthManagerErrorDict,
} from "@/lib/auth/vault-errors";

/**
 * GET endpoint to retrieve persistent token information for an authenticated user session.
 *
 * This endpoint validates the incoming request token, extracts the session ID,
 * and retrieves the associated persistent token from storage.
 *
 * @param request - The NextRequest object containing the HTTP request data
 * @returns A response containing the persistent token ID and session ID if successful,
 *          or an error response if validation fails or token is not found
 *
 * @throws {AuthManagerError} When persistent token is not found for the user session
 */
export async function GET(request: NextRequest) {
  try {
    const validation = await validateRequest(request);

    if (!validation.valid) {
      return makeAuthManagerError(
        new AuthManagerError(AuthManagerErrorDict.unauthorized.code, {
          issue: "Token is not valid",
        })
      );
    }

    if (!validation.sessionId) {
      return makeAuthManagerError(
        new AuthManagerError(AuthManagerErrorDict.unauthorized.code, {
          issue: "No session id was found",
        })
      );
    }

    const vault = GetStorage();
    const persistentToken = await vault.retrieveUserPersistentIdBySession(
      validation.sessionId
    );
    console.log("–– – GET – persistentToken––", persistentToken);

    if (!persistentToken) {
      throw new AuthManagerError(AuthManagerErrorDict.token_not_found.code, {
        issue: "Persistent token not found for user session",
      });
    }

    return makeResponse({
      persistentTokenId: persistentToken.id,
      sessionId: persistentToken.sessionId,
    });
  } catch (error) {
    return throwError(error);
  }
}
