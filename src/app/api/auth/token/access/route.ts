import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTokenVault } from "@/lib/auth/token-vault-factory";
import { getKeycloakClient } from "@/lib/auth/keycloak-client";
import { decryptToken } from "@/lib/auth/encryption";
import { validateRequest } from "@/lib/auth/validate-token";
import {
  createAuthError,
  AuthErrorCode,
  getErrorResponse,
} from "@/lib/auth/errors";

// Request schema
const AccessTokenRequestSchema = z.object({
  persistentTokenId: z.uuid(),
});

/**
 * Exchange persistent token ID for fresh access token
 */
async function exchangeToken(request: NextRequest) {
  // Validate Bearer token from Authorization header
  const validation = await validateRequest(request);
  if (!validation.valid) {
    throw createAuthError(
      validation.error || "Unauthorized",
      AuthErrorCode.UNAUTHORIZED,
      401
    );
  }

  // Parse and validate request body
  const body = await request.json();
  const parseResult = AccessTokenRequestSchema.safeParse(body);
  if (!parseResult.success) {
    throw createAuthError(
      "Invalid request body",
      AuthErrorCode.INVALID_REQUEST,
      400,
      parseResult.error.issues
    );
  }

  const { persistentTokenId } = parseResult.data;

  // Retrieve token from vault
  const tokenVault = getTokenVault();
  const tokenEntry = await tokenVault.retrieve(persistentTokenId);

  if (!tokenEntry) {
    throw createAuthError(
      "Token not found",
      AuthErrorCode.TOKEN_NOT_FOUND,
      404
    );
  }

  // Check if token has expired
  if (tokenEntry.expiresAt < new Date()) {
    // Clean up expired token
    await tokenVault.delete(persistentTokenId);
    throw createAuthError("Token expired", AuthErrorCode.TOKEN_EXPIRED, 401);
  }

  // Decrypt the token
  const token = decryptToken(tokenEntry.encryptedToken, tokenEntry.iv);

  const keycloakClient = getKeycloakClient();

  // Exchange token for new access token
  let tokenResponse;
  try {
    tokenResponse = await keycloakClient.refreshAccessToken(token);
  } catch (error: any) {
    // Handle specific Keycloak errors
    if (error.error === "invalid_grant") {
      // Token is invalid or revoked, clean it up
      await tokenVault.delete(persistentTokenId);
      throw createAuthError(
        "Token invalid or revoked",
        AuthErrorCode.TOKEN_INVALID,
        401,
        { keycloakError: error.error }
      );
    }

    throw createAuthError(
      "Failed to exchange token with Keycloak",
      AuthErrorCode.KEYCLOAK_ERROR,
      500,
      { originalError: error.message }
    );
  }

  // If Keycloak returns a new refresh token, update it in the vault
  if (tokenResponse.refresh_token && tokenResponse.refresh_token !== token) {
    try {
      // Delete old token
      await tokenVault.delete(persistentTokenId);

      // Store new token with same ID
      const expiresAt =
        tokenEntry.tokenType === "offline"
          ? new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) // 10 days for offline
          : new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours for refresh

      await tokenVault.store(
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

      console.log("Token rotated in vault:", persistentTokenId);
    } catch (error) {
      console.error("Failed to update rotated token:", error);
      // Don't fail the request if vault update fails
    }
  }

  return {
    accessToken: tokenResponse.access_token,
    expiresIn: tokenResponse.expires_in,
    tokenType: "Bearer" as const,
  };
}

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
    const result = await exchangeToken(request);
    return NextResponse.json(result);
  } catch (error) {
    const errorResponse = getErrorResponse(error);
    const responseBody: {
      error: string;
      code: string;
      details?: unknown;
    } = {
      error: errorResponse.message,
      code: errorResponse.code,
    };

    if (errorResponse.details) {
      responseBody.details = errorResponse.details;
    }

    return NextResponse.json(responseBody, {
      status: errorResponse.statusCode,
    });
  }
}
