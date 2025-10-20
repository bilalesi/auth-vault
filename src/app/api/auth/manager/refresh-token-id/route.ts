import { NextRequest } from "next/server";
import { validateRequest } from "@/lib/auth/validate-token";
import {
  throwError,
  makeResponse,
  makeAuthManagerError,
} from "@/lib/auth/response";
import {
  AuthManagerError,
  AuthManagerErrorDict,
} from "@/lib/auth/vault-errors";
import { getRefreshTokenId } from "@/lib/services/refresh-token-id.service";

/**
 * GET /api/auth/manager/refresh-token-id
 *
 * Retrieves the user's refresh token ID and expiration time.
 */
export async function GET(request: NextRequest) {
  try {
    const validation = await validateRequest(request);

    if (!validation.valid) {
      return makeAuthManagerError(
        new AuthManagerError(AuthManagerErrorDict.unauthorized.code)
      );
    }

    const result = await getRefreshTokenId({ userId: validation.userId });
    return makeResponse(result);
  } catch (error) {
    return throwError(error);
  }
}
