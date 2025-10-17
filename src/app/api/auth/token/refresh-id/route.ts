import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTokenVault } from "@/lib/auth/token-vault-factory";
import { validateRequest } from "@/lib/auth/validate-token";

// Response schema
const RefreshIdResponseSchema = z.object({
  persistentTokenId: z.string().uuid(),
  expiresAt: z.string().datetime(),
});

/**
 * POST /api/auth/token/refresh-id
 *
 * Returns the persistent token ID for the user's refresh token.
 * This endpoint is used by external services (like Jupyter Launcher)
 * to get a token ID that can be used to obtain fresh access tokens.
 *
 * The refresh token is already stored in the vault during login,
 * so this endpoint validates the access token and returns the persistentTokenId.
 *
 * External services must pass the access token in the Authorization header:
 * Authorization: Bearer <access_token>
 *
 * Requirements: 9.1, 3.1, 3.2
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

    // Get user's refresh token from vault
    // The refresh token was stored during login with the user's ID
    const tokenVault = getTokenVault();
    const userTokens = await tokenVault.getUserTokens(validation.userId);

    // Find the refresh token (not offline token)
    const refreshTokenEntry = userTokens.find(
      (entry) => entry.tokenType === "refresh"
    );

    if (!refreshTokenEntry) {
      return NextResponse.json(
        {
          error: "No refresh token available",
          code: "NO_REFRESH_TOKEN",
          message:
            "Refresh token was not stored during login. Please log in again.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      persistentTokenId: refreshTokenEntry.id,
      expiresAt: refreshTokenEntry.expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("Refresh token ID request error:", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
