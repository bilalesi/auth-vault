import { NextRequest } from "next/server";
import { z } from "zod";
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
import { getAccessToken } from "@/lib/services/access-token.service";

const AccessTokenRequestSchema = z.object({
  persistent_token_id: z.uuid(),
});

/**
 * GET /api/auth/manager/access-token
 *
 * Retrieves a fresh access token using a persistent token ID.
 *
 * Query Parameters:
 * - persistent_token_id: UUID of the stored refresh/offline token
 *
 * Returns:
 * - accessToken: The new access token
 * - expiresIn: Number of seconds until expiration
 */
export async function GET(request: NextRequest) {
  try {
    const validation = await validateRequest(request);
    if (!validation.valid) {
      return makeAuthManagerError(
        new AuthManagerError(AuthManagerErrorDict.unauthorized.code)
      );
    }

    const query = request.nextUrl.searchParams;
    const { persistent_token_id } = await AccessTokenRequestSchema.parseAsync({
      persistent_token_id: query.get("persistent_token_id"),
    });

    const result = await getAccessToken({
      persistentTokenId: persistent_token_id,
      userId: validation.userId,
    });

    return makeResponse(result);
  } catch (error) {
    return throwError(error);
  }
}
