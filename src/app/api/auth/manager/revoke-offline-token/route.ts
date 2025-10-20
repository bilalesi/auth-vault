import { NextRequest } from "next/server";
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
import { revokeOfflineToken } from "@/lib/services/revoke-offline-token.service";

/**
 * DELETE /api/auth/manager/revoke-offline-token
 *
 * Revokes an offline token and optionally revokes the Keycloak session
 * if it's the last token for that session.
 */
export async function DELETE(request: NextRequest) {
  try {
    const validation = await validateRequest(request);

    if (!validation.valid) {
      return makeAuthManagerError(
        new AuthManagerError(AuthManagerErrorDict.unauthorized.code)
      );
    }

    const body = await request.json();
    const result = await revokeOfflineToken(
      { userId: validation.userId, persistentTokenId: "" },
      body
    );

    return makeResponse(result);
  } catch (error) {
    return throwError(error);
  }
}
