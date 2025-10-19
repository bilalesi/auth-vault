import { NextRequest } from "next/server";
import { z } from "zod";
import { GetStorage } from "@/lib/auth/token-vault-factory";
import { getKeycloakClient } from "@/lib/auth/keycloak-client";
import { decryptToken } from "@/lib/auth/encryption";
import { validateRequest } from "@/lib/auth/validate-token";
import {
  AuthManagerError,
  AuthManagerErrorDict,
} from "@/lib/auth/vault-errors";
import { AuthManagerTokenTypeDict } from "@/lib/auth/token-vault-interface";
import { makeResponse, makeVaultError, throwError } from "@/lib/auth/response";
import {
  isExpired,
  TokenExpirationDict,
  getExpirationDate,
} from "@/lib/auth/date-utils";

const AccessTokenRequestSchema = z.object({
  persistentTokenId: z.uuid(),
});

/**
 * Handles the GET request for retrieving and refreshing an access token.
 *
 * This function validates the incoming request, retrieves the persistent token
 * from the storage, checks its validity, and refreshes the access token using
 * the Keycloak client. If the token is expired or not found, appropriate errors
 * are returned. If the token is successfully refreshed, the new access token
 * and its expiration time are returned in the response.
 *
 * @param request - The incoming `NextRequest` object containing the request details.
 * @returns A response object containing the refreshed access token and its expiration time,
 *          or an error response if the operation fails.
 *
 * @throws {AuthManagerError} Throws errors for unauthorized requests, token not found,
 *                            token expired, or other unexpected issues.
 */
export async function GET(request: NextRequest) {
  try {
    const validation = await validateRequest(request);
    if (!validation.valid) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.unauthorized.code)
      );
    }

    const query = request.nextUrl.searchParams;
    const { persistentTokenId } = AccessTokenRequestSchema.parse({
      persistentTokenId: query.get("id"),
    });

    const vault = GetStorage();
    const entry = await vault.retrieve(persistentTokenId);

    if (!entry) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.token_not_found.code, {
          persistentTokenId,
        })
      );
    }

    if (isExpired(entry.expiresAt)) {
      await vault.delete(persistentTokenId);
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.token_expired.code, {
          persistentTokenId,
        })
      );
    }

    if (!entry.encryptedToken || !entry.iv) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.token_not_found.code, {
          persistentTokenId,
          reason: "Token is pending and not yet available",
          status: entry.status,
        })
      );
    }
    console.log("———entry", entry);
    const keycloakClient = getKeycloakClient();
    const token = decryptToken(entry.encryptedToken, entry.iv);
    const response = await keycloakClient.refreshAccessToken(token);

    if (response.refresh_token) {
      const expiresAt =
        entry.tokenType === AuthManagerTokenTypeDict.Offline
          ? getExpirationDate(TokenExpirationDict.Offline)
          : getExpirationDate(TokenExpirationDict.Refresh);

      await vault.create(
        entry.userId,
        response.refresh_token,
        entry.tokenType,
        expiresAt,
        {
          ...entry.metadata,
          updatedAt: new Date().toISOString(),
        },
        persistentTokenId
      );
    }

    return makeResponse({
      accessToken: response.access_token,
      expiresIn: response.expires_in,
    });
  } catch (error) {
    console.log("–– – GET – error––", error);
    return throwError(error);
  }
}
