import { NextRequest } from "next/server";
import { GetStorage } from "@/lib/auth/token-vault-factory";
import { validateRequest } from "@/lib/auth/validate-token";
import { makeResponse, makeVaultError, throwError } from "@/lib/auth/response";
import {
  AuthManagerError,
  AuthManagerErrorDict,
} from "@/lib/auth/vault-errors";

/**
 * GET /api/auth/manager/offline-tokens
 *
 * Retrieves all offline tokens for the authenticated user.
 * Returns token metadata without exposing encrypted tokens or IVs.
 *
 * @param request - NextRequest containing:
 *   - headers: Authorization with access token
 *
 * @returns Response with:
 *   - tokens: Array of token metadata objects
 *   - count: Total number of offline tokens
 *
 * @throws {AuthManagerError} If user is not authenticated
 *
 * @example
 * ```typescript
 * const response = await fetch('/api/auth/manager/offline-tokens', {
 *   headers: { Authorization: `Bearer ${accessToken}` }
 * });
 * const { tokens, count } = await response.json();
 * ```
 */
export async function GET(request: NextRequest) {
  try {
    const validation = await validateRequest(request);

    if (!validation.valid || !validation.userId) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.unauthorized.code)
      );
    }

    const vault = GetStorage();
    const tokens = await vault.retrieveUserOfflineTokens(validation.userId);

    const safeTokens = tokens.map((token) => ({
      id: token.id,
      userId: token.userId,
      tokenType: token.tokenType,
      status: token.status,
      taskId: token.taskId,
      sessionState: token.sessionState,
      createdAt: token.createdAt,
      expiresAt: token.expiresAt,
      metadata: token.metadata,
    }));

    return makeResponse({
      tokens: safeTokens,
      count: safeTokens.length,
    });
  } catch (error) {
    return throwError(error);
  }
}
