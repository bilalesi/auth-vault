import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getKeycloakClient } from "@/lib/auth/keycloak-client";

/**
 * Test endpoint to inspect actual Keycloak token response shapes
 * This helps us validate our Zod schemas
 */
export async function GET() {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const keycloakClient = getKeycloakClient();
    const results: any = {
      session: {
        user: session.user,
        hasAccessToken: !!session.accessToken,
        hasIdToken: !!session.idToken,
        error: session.error,
      },
      tests: {},
    };

    // Test 1: Token Introspection
    if (session.accessToken) {
      try {
        const introspection = await keycloakClient.introspectToken(
          session.accessToken
        );
        results.tests.introspection = {
          success: true,
          data: introspection,
          fields: Object.keys(introspection),
        };
      } catch (error: any) {
        results.tests.introspection = {
          success: false,
          error: error.message,
        };
      }
    }

    // Test 2: User Info
    if (session.accessToken) {
      try {
        const userInfo = await keycloakClient.getUserInfo(session.accessToken);
        results.tests.userInfo = {
          success: true,
          data: userInfo,
          fields: Object.keys(userInfo),
        };
      } catch (error: any) {
        results.tests.userInfo = {
          success: false,
          error: error.message,
        };
      }
    }

    // Test 3: Token Refresh (we'll use the refresh token from session)
    // Note: This is read from the JWT token on the server side
    // We can't directly access it here, but we can test the endpoint structure

    return NextResponse.json(results, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message, stack: error.stack },
      { status: 500 }
    );
  }
}
