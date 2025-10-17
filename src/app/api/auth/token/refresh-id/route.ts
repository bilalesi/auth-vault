import { NextRequest } from "next/server";
import { GetStorage } from "@/lib/auth/token-vault-factory";
import { validateRequest } from "@/lib/auth/validate-token";
import { VaultTokenTypeDict } from "@/lib/auth/token-vault-interface";
import { throwError, makeResponse, makeVaultError } from "@/lib/auth/response";
import { VaultError, VaultErrorCodeDict } from "@/lib/auth/vault-errors";

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
export async function POST(request: NextRequest) {
  try {
    // Validate Bearer token from Authorization header
    const validation = await validateRequest(request);

    if (!validation.valid || !validation.userId) {
      return makeVaultError(
        new VaultError(VaultErrorCodeDict.unauthorized, {
          userId: validation.userId,
        })
      );
    }

    // Get user's refresh token from vault
    const vault = GetStorage();
    const userTokens = await vault.getUserTokens(validation.userId);

    // Find the refresh token (not offline token)
    const refreshTokenEntry = userTokens.find(
      (entry) => entry.tokenType === VaultTokenTypeDict.Refresh
    );

    if (!refreshTokenEntry) {
      return makeVaultError(
        new VaultError(VaultErrorCodeDict.no_refresh_token, {
          userId: validation.userId,
        })
      );
    }

    return makeResponse({
      persistentTokenId: refreshTokenEntry.id,
      expiresAt: refreshTokenEntry.expiresAt.toISOString(),
    });
  } catch (error) {
    return throwError(error);
  }
}
