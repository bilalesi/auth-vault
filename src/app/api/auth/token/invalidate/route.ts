import { NextRequest, NextResponse } from "next/server";
import { getTokenVault } from "@/lib/auth/token-vault-factory";
import { getKeycloakClient } from "@/lib/auth/keycloak-client";
import { decryptToken } from "@/lib/auth/encryption";
import { validateRequest } from "@/lib/auth/validate-token";

/**
 * POST /api/auth/logout
 *
 * Custom logout handler that:
 * 1. Revokes the refresh token in Keycloak
 * 2. Deletes the token from the vault
 * 3. Returns success (NextAuth signOut will clear the session)
 */
export async function POST(request: NextRequest) {
  try {
    // Validate Bearer token from Authorization header
    const validation = await validateRequest(request);

    if (!validation.valid || !validation.userId) {
      return NextResponse.json(
        { error: validation.error || "Unauthorized" },
        { status: 401 }
      );
    }

    // Get all tokens for this user and revoke them
    const tokenVault = getTokenVault();
    const userTokens = await tokenVault.getUserTokens(validation.userId);

    // Revoke all tokens for this user
    for (const tokenEntry of userTokens) {
      try {
        // Decrypt the token
        const token = decryptToken(tokenEntry.encryptedToken, tokenEntry.iv);

        // Revoke the token in Keycloak
        const keycloakClient = getKeycloakClient();

        await keycloakClient.revokeToken(token);
        console.log(
          `${tokenEntry.tokenType} token revoked in Keycloak:`,
          tokenEntry.id
        );

        // Delete from vault
        await tokenVault.delete(tokenEntry.id);
        console.log("Token deleted from vault:", tokenEntry.id);
      } catch (error) {
        // Log but don't fail the logout if revocation fails
        console.error("Error during token cleanup:", error);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
