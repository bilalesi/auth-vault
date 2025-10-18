import { NextRequest } from "next/server";
import { GetStorage } from "@/lib/auth/token-vault-factory";
import { validateRequest } from "@/lib/auth/validate-token";
import { VaultTokenTypeDict } from "@/lib/auth/token-vault-interface";
import { throwError, makeResponse, makeVaultError } from "@/lib/auth/response";
import {
  AuthManagerError,
  AuthManagerErrorDict,
} from "@/lib/auth/vault-errors";

/**
 * POST /api/auth/token/refresh-id
 *
 * Returns the persistent token ID for the user's refresh token.
 * This endpoint is used by external services (like Jupyter Launcher)
 * to get a token ID that can be used to obtain fresh access tokens.
 *
 * The refresh token is already stored in the vault during login,
 * so this endpoint validates the access token and returns the persistentTokenId.
 *
 * External services must pass the access token in the Authorization header:
 * Authorization: Bearer <access_token>
 *
 * Requirements: 9.1, 3.1, 3.2
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
    const userTokens = await vault.getUserTokens(validation.userId);

    const entry = userTokens.find(
      (entry) => entry.tokenType === VaultTokenTypeDict.Refresh
    );

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
