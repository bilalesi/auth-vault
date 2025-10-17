import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { getToken } from "next-auth/jwt";
import { cookies } from "next/headers";

/**
 * Test endpoint to inspect token refresh response shape
 */
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get the JWT token which contains the refresh token (server-side only)
    const token = await getToken({
      req: request as any,
      secret: process.env.NEXTAUTH_SECRET,
    });
    console.log("–– – GET – token––", token);

    const results: any = {
      sessionFields: Object.keys(session),
      hasRefreshToken: !!token?.refreshToken,
      hasAccessToken: !!token?.accessToken,
      tokenFields: token ? Object.keys(token) : [],
    };

    // Test refresh token endpoint
    if (token?.refreshToken) {
      try {
        const issuer = process.env.KEYCLOAK_ISSUER!;
        const clientId = process.env.KEYCLOAK_CLIENT_ID!;
        const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET!;

        const response = await fetch(
          `${issuer}/protocol/openid-connect/token`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              grant_type: "refresh_token",
              refresh_token: token.refreshToken as string,
            }),
          }
        );

        const refreshData = await response.json();

        results.refreshTokenResponse = {
          success: response.ok,
          status: response.status,
          data: refreshData,
          fields: Object.keys(refreshData),
        };
      } catch (error: any) {
        results.refreshTokenResponse = {
          success: false,
          error: error.message,
        };
      }
    } else {
      results.refreshTokenResponse = {
        success: false,
        error: "No refresh token available in JWT token",
      };
    }

    return NextResponse.json(results, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message, stack: error.stack },
      { status: 500 }
    );
  }
}
