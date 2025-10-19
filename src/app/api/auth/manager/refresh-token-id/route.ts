import { NextRequest } from "next/server";
import { GetStorage } from "@/lib/auth/token-vault-factory";
import { validateRequest } from "@/lib/auth/validate-token";
import { throwError, makeResponse, makeVaultError } from "@/lib/auth/response";
import {
  AuthManagerError,
  AuthManagerErrorDict,
} from "@/lib/auth/vault-errors";

/**
 * Handles the GET request for refreshing the token ID.
 *
 * This function validates the incoming request, retrieves the user's refresh token
 * from the storage, and returns the token details if valid. If the request is invalid
 * or the refresh token is not found, it returns an appropriate error response.
 *
 * @param request - The incoming HTTP request of type `NextRequest`.
 * @returns A response containing the persistent token ID and its expiration time,
 *          or an error response in case of validation failure or missing token.
 *
 * @throws Will throw an error if an unexpected issue occurs during processing.
 */
export async function GET(request: NextRequest) {
  try {
    const validation = await validateRequest(request);

    if (!validation.valid) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.unauthorized.code)
      );
    }

    const vault = GetStorage();
    const entry = await vault.getUserRefreshToken(validation.userId);

    if (!entry) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.no_refresh_token.code, {
          userId: validation.userId,
        })
      );
    }

    return makeResponse({
      persistentTokenId: entry.id,
      expiresAt: entry.expiresAt.toISOString(),
    });
  } catch (error) {
    return throwError(error);
  }
}
