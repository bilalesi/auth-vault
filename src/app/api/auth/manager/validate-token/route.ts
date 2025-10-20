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
 * Handles the GET request for validating a token.
 *
 * @param request - The incoming HTTP request of type `NextRequest`.
 * @returns A promise that resolves to an HTTP response. If the token validation
 *          fails, it returns an error response with an unauthorized status.
 *          Otherwise, it returns a successful response.
 *
 * @throws Will throw an error if an unexpected issue occurs during processing.
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
