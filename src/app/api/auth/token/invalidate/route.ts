import { NextRequest } from "next/server";
import { GetStorage } from "@/lib/auth/token-vault-factory";
import { getKeycloakClient } from "@/lib/auth/keycloak-client";
import { decryptToken } from "@/lib/auth/encryption";
import { validateRequest } from "@/lib/auth/validate-token";
import { throwError, makeResponse, makeVaultError } from "@/lib/auth/response";
import { VaultError, VaultErrorCodeDict } from "@/lib/auth/vault-errors";

/**
 * POST /api/auth/token/invalidate
 *
 * Invalidates all tokens for the authenticated user:
 * 1. Revokes all tokens in Keycloak
 * 2. Deletes all tokens from the vault
 * 3. Returns success
 */
export async function POST(request: NextRequest) {
  try {
    // Validate Bearer token from Authorization header
    const validation = await validateRequest(request);

    if (!validation.valid || !validation.userId) {
      return makeVaultError(
        new VaultError(VaultErrorCodeDict.unauthorized, {
          userId: validation.userId,
        })
      );
    }

    // Get all tokens for this user and revoke them
    const vault = GetStorage();
    const userTokens = await vault.getUserTokens(validation.userId);

    // Revoke all tokens for this user
    for (const tokenEntry of userTokens) {
      try {
        // Decrypt the token
        const token = decryptToken(tokenEntry.encryptedToken, tokenEntry.iv);

        // Revoke the token in Keycloak
        const keycloakClient = getKeycloakClient();
        await keycloakClient.revokeToken(token);
        console.log(
          `${tokenEntry.tokenType} token revoked in keycloak:`,
          tokenEntry.id
        );

        // Delete from vault
        await vault.delete(tokenEntry.id);
        console.log("token deleted from vault:", tokenEntry.id);
      } catch (error) {
        // Log but don't fail the invalidation if revocation fails
        console.error("error during token cleanup:", error);
      }
    }

    return makeResponse({ success: true });
  } catch (error) {
    return throwError(error);
  }
}
