import { NextRequest } from "next/server";
import { z } from "zod";
import { GetStorage } from "@/lib/auth/token-vault-factory";
import { getKeycloakClient } from "@/lib/auth/keycloak-client";
import { decryptToken } from "@/lib/auth/encryption";
import { validateRequest } from "@/lib/auth/validate-token";
import {
  AuthManagerError,
  AuthManagerErrorCodeDict,
} from "@/lib/auth/vault-errors";
import { VaultTokenTypeDict } from "@/lib/auth/token-vault-interface";
import { makeResponse, makeVaultError, throwError } from "@/lib/auth/response";
import {
  isExpired,
  TokenExpirationDict,
  getExpirationDate,
} from "@/lib/auth/date-utils";

// Request schema
const AccessTokenRequestSchema = z.object({
  persistentTokenId: z.uuid(),
});

/**
 * POST /api/auth/token/access
 *
 * Exchanges a persistent token ID for a fresh access token.
 * Works with both refresh tokens and offline tokens.
 *
 * Requirements: 9.3, 3.4, 3.5, 4.4, 4.5, 6.3, 6.4, 6.5
 */
export async function POST(request: NextRequest) {
  try {
    // Validate Bearer token from Authorization header
    const validation = await validateRequest(request);
    if (!validation.valid) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorCodeDict.unauthorized)
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const { persistentTokenId } = AccessTokenRequestSchema.parse(body);

    // Retrieve token from vault
    const vault = GetStorage();
    const tokenEntry = await vault.retrieve(persistentTokenId);

    if (!tokenEntry) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorCodeDict.token_not_found, {
          persistentTokenId,
        })
      );
    }

    // Check if token has expired
    if (isExpired(tokenEntry.expiresAt)) {
      await vault.delete(persistentTokenId);
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorCodeDict.token_expired, {
          persistentTokenId,
        })
      );
    }

    // Check if token is available (not pending)
    if (!tokenEntry.encryptedToken || !tokenEntry.iv) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorCodeDict.token_not_found, {
          persistentTokenId,
          reason: "Token is pending and not yet available",
          status: tokenEntry.status,
        })
      );
    }

    // Decrypt the token
    const token = decryptToken(tokenEntry.encryptedToken, tokenEntry.iv);
    const keycloakClient = getKeycloakClient();

    // Exchange token for new access token
    const tokenResponse = await keycloakClient.refreshAccessToken(token);

    // If Keycloak returns a new refresh token, update it in the vault
    if (tokenResponse.refresh_token && tokenResponse.refresh_token !== token) {
      // Delete old token
      await vault.delete(persistentTokenId);

      // Store new token with same ID
      const expiresAt =
        tokenEntry.tokenType === VaultTokenTypeDict.Offline
          ? getExpirationDate(TokenExpirationDict.offline)
          : getExpirationDate(TokenExpirationDict.refresh);

      await vault.store(
        tokenEntry.userId,
        tokenResponse.refresh_token,
        tokenEntry.tokenType,
        expiresAt,
        {
          ...tokenEntry.metadata,
          updatedAt: new Date().toISOString(),
        },
        persistentTokenId // Use same ID
      );

      console.log("token rotated in vault:", persistentTokenId);
    }

    return makeResponse({
      accessToken: tokenResponse.access_token,
      expiresIn: tokenResponse.expires_in,
    });
  } catch (error) {
    return throwError(error);
  }
}
