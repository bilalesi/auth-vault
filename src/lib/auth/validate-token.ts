import { NextRequest } from "next/server";
import { getKeycloakClient } from "./keycloak-client";
import {
  VaultError,
  VaultErrorCodeDict,
  VaultOperationDict,
} from "./vault-errors";

/**
 * Extract Bearer token from Authorization header
 */
export function extractBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");

  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return null;
  }

  return parts[1];
}

/**
 * Validate access token with Keycloak and return user info
 * @throws {VaultError} if token is invalid or validation fails
 */
export async function validateAccessToken(accessToken: string): Promise<{
  userId: string;
  email?: string;
  username?: string;
}> {
  try {
    const keycloakClient = getKeycloakClient();

    // Introspect the token to validate it
    const introspection = await keycloakClient.introspectToken(accessToken);

    if (!introspection.active) {
      throw new VaultError(VaultErrorCodeDict.token_not_active, {
        operation: VaultOperationDict.introspect_token,
      });
    }

    // Get user info from the token
    const userInfo = await keycloakClient.getUserInfo(accessToken);

    return {
      userId: userInfo.sub,
      email: userInfo.email,
      username: userInfo.preferred_username,
    };
  } catch (error) {
    if (VaultError.is(error)) {
      throw error;
    }

    console.error("error validating access token:", error);
    throw new VaultError(VaultErrorCodeDict.token_introspection_failed, {
      operation: VaultOperationDict.introspect_token,
      originalError: error,
    });
  }
}

/**
 * Middleware helper to validate Bearer token from request
 * Returns validation result with error info instead of throwing
 */
export async function validateRequest(request: NextRequest): Promise<{
  valid: boolean;
  userId?: string;
  email?: string;
  username?: string;
  accessToken?: string;
  error?: string;
}> {
  try {
    const accessToken = extractBearerToken(request);

    if (!accessToken) {
      return {
        valid: false,
        error: "missing or invalid authorization header",
      };
    }

    const userInfo = await validateAccessToken(accessToken);

    return {
      valid: true,
      ...userInfo,
      accessToken,
    };
  } catch (error) {
    if (VaultError.is(error)) {
      return {
        valid: false,
        error: error.msg(),
      };
    }

    return {
      valid: false,
      error: error instanceof Error ? error.message : "validation failed",
    };
  }
}
