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
import { VaultTokenTypeDict } from "@/lib/auth/token-vault-interface";
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
 * POST /api/auth/token/access
 *
 * Exchanges a persistent token ID for a fresh access token.
 * Works with both refresh tokens and offline tokens.
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

    const keycloakClient = getKeycloakClient();
    const token = decryptToken(entry.encryptedToken, entry.iv);
    const response = await keycloakClient.refreshAccessToken(token);

    if (response.refresh_token) {
      // it will be deleted in the store
      // await vault.delete(persistentTokenId);
      const expiresAt =
        entry.tokenType === VaultTokenTypeDict.Offline
          ? getExpirationDate(TokenExpirationDict.offline)
          : getExpirationDate(TokenExpirationDict.refresh);

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
    return throwError(error);
  }
}
