import { NextRequest } from "next/server";

import {
  AuthManagerError,
  AuthManagerErrorDict,
} from "@/services/auth-manager/auth/vault-errors";
import { validateRequest } from "@/services/auth-manager/auth/validate-token";
import {
  makeAuthManagerOkResponse,
  makeAuthManagerError,
  makeAuthManagerErrorResponse,
} from "@/services/auth-manager/auth/response";

/**
 * GET /api/auth-manager/validate-token
 *
 * Validates the user's access token.
 */
export async function GET(request: NextRequest) {
  try {
    const validation = await validateRequest(request);
    if (!validation.valid) {
      return makeAuthManagerError(
        new AuthManagerError(AuthManagerErrorDict.token_not_active.code)
      );
    }

    return makeAuthManagerOkResponse({});
  } catch (error) {
    return makeAuthManagerErrorResponse(error);
  }
}
