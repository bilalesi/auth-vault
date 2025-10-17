import { NextRequest } from "next/server";
import { getKeycloakClient } from "./keycloak-client";

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
 */
export async function validateAccessToken(accessToken: string): Promise<{
  valid: boolean;
  userId?: string;
  email?: string;
  username?: string;
  error?: string;
}> {
  try {
    const keycloakClient = getKeycloakClient();

    // Introspect the token to validate it
    const introspection = await keycloakClient.introspectToken(accessToken);

    if (!introspection.active) {
      return {
        valid: false,
        error: "Token is not active",
      };
    }

    // Get user info from the token
    const userInfo = await keycloakClient.getUserInfo(accessToken);

    return {
      valid: true,
      userId: userInfo.sub,
      email: userInfo.email,
      username: userInfo.preferred_username,
    };
  } catch (error) {
    console.error("Error validating access token:", error);
    return {
      valid: false,
      error: "Failed to validate token",
    };
  }
}

/**
 * Middleware helper to validate Bearer token from request
 */
export async function validateRequest(request: NextRequest): Promise<{
  valid: boolean;
  userId?: string;
  email?: string;
  username?: string;
  accessToken?: string;
  error?: string;
}> {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return {
      valid: false,
      error: "Missing or invalid Authorization header",
    };
  }

  const validation = await validateAccessToken(accessToken);

  if (!validation.valid) {
    return validation;
  }

  return {
    ...validation,
    accessToken,
  };
}
