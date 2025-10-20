import { NextRequest } from "next/server";
import { validateRequest } from "@/lib/auth/validate-token";
import {
  AuthManagerError,
  AuthManagerErrorDict,
} from "@/lib/auth/vault-errors";
import {
  makeResponse,
  makeAuthManagerError,
  throwError,
} from "@/lib/auth/response";

/**
 * GET /api/auth/manager/validate-token
 *
 * Validates the user's access token.
 */
export async function GET(request: NextRequest) {
  try {
    const validation = await validateRequest(request);
    if (!validation.valid) {
      return makeAuthManagerError(
        new AuthManagerError(AuthManagerErrorDict.unauthorized.code)
      );
    }

    return makeResponse({});
  } catch (error) {
    return throwError(error);
  }
}
