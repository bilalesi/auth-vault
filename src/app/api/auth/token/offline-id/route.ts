import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getKeycloakClient } from "@/lib/auth/keycloak-client";
import { getTokenVault } from "@/lib/auth/token-vault-factory";
import { decryptToken } from "@/lib/auth/encryption";
import { validateRequest } from "@/lib/auth/validate-token";

// Request schema
const OfflineTokenRequestSchema = z.object({
  redirectUri: z.string().url().optional(),
});

// Response schemas
const OfflineTokenResponseSchema = z.object({
  persistentTokenId: z.string().uuid().optional(),
  consentUrl: z.string().url().optional(),
  expiresAt: z.string().datetime().optional(),
});

/**
 * POST /api/auth/token/offline-id
 *
 * Requests an offline token from Keycloak and returns a persistent token ID.
 * If user consent is required, returns a consent URL instead.
 *
 * Requirements: 9.2, 5.1, 5.2, 5.3
 */
export async function POST(request: NextRequest) {
  try {
    // Validate Bearer token from Authorization header
    const validation = await validateRequest(request);

    if (!validation.valid || !validation.userId) {
      return NextResponse.json(
        { error: validation.error || "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedBody = OfflineTokenRequestSchema.parse(body);

    // Initialize Keycloak client
    const keycloakClient = getKeycloakClient();

    // Get the user's refresh token from the vault
    // We need to find the refresh token for this user
    const tokenVault = getTokenVault();
    const userTokens = await tokenVault.getUserTokens(validation.userId);

    // Find the refresh token (not offline token)
    const refreshTokenEntry = userTokens.find((t) => t.tokenType === "refresh");

    if (!refreshTokenEntry) {
      return NextResponse.json(
        { error: "No refresh token available", code: "NO_REFRESH_TOKEN" },
        { status: 400 }
      );
    }

    // Decrypt the refresh token
    const refreshToken = decryptToken(
      refreshTokenEntry.encryptedToken,
      refreshTokenEntry.iv
    );

    // Request offline token from Keycloak by exchanging the refresh token
    try {
      const offlineTokenResponse = await keycloakClient.requestOfflineToken(
        refreshToken
      );

      // If we have an offline token, store it in the vault
      if (offlineTokenResponse.refresh_token) {
        const tokenVault = getTokenVault();

        // Calculate expiration (10 days for offline tokens)
        const expiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

        const persistentTokenId = await tokenVault.store(
          validation.userId,
          offlineTokenResponse.refresh_token,
          "offline",
          expiresAt,
          {
            email: validation.email,
            username: validation.username,
            createdVia: "offline_token_request",
          }
        );

        console.log("Offline token stored in vault:", persistentTokenId);

        return NextResponse.json({
          persistentTokenId,
          expiresAt: expiresAt.toISOString(),
        });
      }

      // Unexpected response
      return NextResponse.json(
        { error: "Failed to obtain offline token", code: "KEYCLOAK_ERROR" },
        { status: 500 }
      );
    } catch (error: any) {
      console.error("Error requesting offline token:", error);

      // Check if it's a consent required error
      if (
        error.error === "consent_required" ||
        error.error_description?.includes("consent")
      ) {
        // Build consent URL
        const consentUrl =
          `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/auth?` +
          `client_id=${process.env.KEYCLOAK_CLIENT_ID}` +
          `&response_type=code` +
          `&scope=openid offline_access` +
          `&redirect_uri=${encodeURIComponent(
            validatedBody.redirectUri ||
              `${process.env.NEXTAUTH_URL}/api/auth/callback/keycloak`
          )}`;

        return NextResponse.json({
          consentUrl,
        });
      }

      return NextResponse.json(
        { error: "Failed to request offline token", code: "KEYCLOAK_ERROR" },
        { status: 500 }
      );
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          code: "INVALID_REQUEST",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    console.error("Offline token request error:", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/auth/token/offline-id
 *
 * Revokes an offline token by:
 * 1. Retrieving it from the vault
 * 2. Revoking it in Keycloak
 * 3. Deleting it from the vault
 *
 * Requirements: 9.4, 7.1, 7.2, 7.3, 7.4, 7.5
 */
export async function DELETE(request: NextRequest) {
  try {
    // Validate Bearer token from Authorization header
    const validation = await validateRequest(request);

    if (!validation.valid || !validation.userId) {
      return NextResponse.json(
        { error: validation.error || "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const RevokeTokenRequestSchema = z.object({
      persistentTokenId: z.string().uuid(),
    });
    const { persistentTokenId } = RevokeTokenRequestSchema.parse(body);

    // Retrieve token from vault
    const tokenVault = getTokenVault();
    const tokenEntry = await tokenVault.retrieve(persistentTokenId);

    if (!tokenEntry) {
      return NextResponse.json(
        { error: "Token not found", code: "TOKEN_NOT_FOUND" },
        { status: 404 }
      );
    }

    // Verify the token belongs to the authenticated user
    if (tokenEntry.userId !== validation.userId) {
      return NextResponse.json(
        { error: "Unauthorized to revoke this token", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    // Only allow revoking offline tokens (not refresh tokens)
    if (tokenEntry.tokenType !== "offline") {
      return NextResponse.json(
        { error: "Can only revoke offline tokens", code: "INVALID_TOKEN_TYPE" },
        { status: 400 }
      );
    }

    // Decrypt the token
    const token = decryptToken(tokenEntry.encryptedToken, tokenEntry.iv);

    // Get Keycloak client
    const keycloakClient = getKeycloakClient();

    // Revoke token in Keycloak
    try {
      await keycloakClient.revokeToken(token);
      console.log("Offline token revoked in Keycloak:", persistentTokenId);
    } catch (error) {
      console.error("Error revoking token in Keycloak:", error);
      // Continue to delete from vault even if Keycloak revocation fails
    }

    // Delete from vault
    await tokenVault.delete(persistentTokenId);
    console.log("Token deleted from vault:", persistentTokenId);

    return NextResponse.json({
      success: true,
      message: "Offline token revoked successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          code: "INVALID_REQUEST",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    console.error("Token revocation error:", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
