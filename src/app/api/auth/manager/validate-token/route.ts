import { NextRequest } from "next/server";
import { validateRequest } from "@/lib/auth/validate-token";
import {
  AuthManagerError,
  AuthManagerErrorCodeDict,
} from "@/lib/auth/vault-errors";
import { makeResponse, makeVaultError, throwError } from "@/lib/auth/response";

/**
 * POST /api/auth/token/access
 *
 * Exchanges a persistent token ID for a fresh access token.
 * Works with both refresh tokens and offline tokens.
 *
 */
export async function GET(request: NextRequest) {
  try {
    const validation = await validateRequest(request);
    if (!validation.valid) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorCodeDict.unauthorized)
      );
    }

    return makeResponse({});
  } catch (error) {
    return throwError(error);
  }
}
