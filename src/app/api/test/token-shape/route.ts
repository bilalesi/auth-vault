import { NextResponse } from "next/server";
import { StatusCodes } from "http-status-codes";
import { auth } from "@/auth";
import { getKeycloakClient } from "@/lib/auth/keycloak-client";

export async function GET() {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: StatusCodes.UNAUTHORIZED }
      );
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

    if (session.accessToken) {
      try {
        const introspection = await keycloakClient.introspect(
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

    if (session.accessToken) {
      try {
        const userInfo = await keycloakClient.info(session.accessToken);
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

    return NextResponse.json(results, { status: StatusCodes.OK });
  } catch (error: any) {
    console.error("—— [TokenShape] – GET error: ", error);
    return NextResponse.json(
      { error: error.message, stack: error.stack },
      { status: StatusCodes.INTERNAL_SERVER_ERROR }
    );
  }
}
