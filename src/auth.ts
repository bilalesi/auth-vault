import { getServerSession, type NextAuthOptions } from "next-auth";
import { type JWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      username?: string | null;
      image?: string | null;
    };
    accessToken?: string;
    idToken?: string;
    persistentTokenId?: string;
    error?: string;
  }

  interface User {
    id: string;
    name?: string | null;
    email?: string | null;
    username?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    accessTokenExpires?: number | null;
    refreshToken?: string;
    idToken?: string;
    persistentTokenId?: string; // ID for accessing refresh token from vault
    user?: {
      id: string;
      name?: string | null;
      email?: string | null;
      username?: string | null;
    };
    error?: string;
  }
}

type TokenSet = JWT;
import {
  GetServerSidePropsContext,
  NextApiRequest,
  NextApiResponse,
} from "next";
import { getExpirationDate, TokenExpirationDict } from "@/lib/auth/date-utils";
import ms from "ms";

const issuer = process.env.KEYCLOAK_ISSUER!;
const clientId = process.env.KEYCLOAK_CLIENT_ID!;
const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET!;

export async function refreshAccessToken(token: TokenSet): Promise<TokenSet> {
  try {
    const tokenUrl = `${issuer}/protocol/openid-connect/token`;

    const response = await fetch(tokenUrl, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      method: "POST",
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken as string,
      }),
    });

    const refreshedTokens = await response.json();

    if (!response.ok) {
      throw refreshedTokens;
    }

    console.info("[token.refreshed]", {
      component: "NextAuth",
      operation: "refreshAccessToken",
      userId: token.user?.id,
    });

    const newRefreshToken = refreshedTokens.refresh_token ?? token.refreshToken;

    token.accessToken = refreshedTokens.access_token;
    token.accessTokenExpires = Date.now() + refreshedTokens.expires_in * 1000;
    token.refreshToken = newRefreshToken;

    if (token.user?.id) {
      try {
        const { GetStorage } = await import("@/lib/auth/token-vault-factory");
        const store = GetStorage();
        const expiresAt = getExpirationDate(TokenExpirationDict.Refresh);

        const persistentTokenId = await store.upsertRefreshToken(
          token.user.id,
          newRefreshToken,
          expiresAt,
          refreshedTokens.session_state,
          {
            name: token.user.name,
            lastRefresh: new Date().toISOString(),
            refreshCount: ((token as any).refreshCount || 0) + 1,
          }
        );

        token.persistentTokenId = persistentTokenId;
        (token as any).refreshCount = ((token as any).refreshCount || 0) + 1;
        console.info("[vault.store]", {
          component: "NextAuth",
          operation: "upsertRefreshToken",
          userId: token.user?.id,
          persistentTokenId,
        });
      } catch (err) {
        console.error("vault.error", {
          component: "NextAuth",
          operation: "upsertRefreshToken",
          userId: token.user?.id,
        });

        // Don't fail the refresh if vault update fails
      }
    }

    return token;
  } catch (err) {
    console.error("[token.refreshed]: Failed to refresh access token", {
      component: "NextAuth",
      operation: "refreshAccessToken",
      userId: token.user?.id,
    });

    token.error = "RefreshAccessTokenError";
    return token;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    {
      clientId,
      id: "keycloak",
      name: "Keycloak",
      type: "oauth",
      clientSecret,
      issuer: issuer,
      authorization: {
        url: `${issuer}/protocol/openid-connect/auth`,
        params: {
          scope: "profile openid email",
        },
      },
      token: `${issuer}/protocol/openid-connect/token`,
      userinfo: `${issuer}/protocol/openid-connect/userinfo`,
      jwks_endpoint: `${issuer}/protocol/openid-connect/certs`,
      idToken: true,
      checks: ["pkce", "state"],
      profile(profile) {
        return {
          name: profile.name,
          email: profile.email,
          username: profile.preferred_username,
          id: profile.sub,
        };
      },
    },
  ],
  callbacks: {
    async jwt({ token, account, user, profile, trigger, session }) {
      console.log("–– – token––", token);
      console.log("–– – account––", account);
      if (account && user) {
        token.accessToken = account.access_token;
        token.accessTokenExpires = account.expires_at
          ? account.expires_at * 1000
          : null;
        token.refreshToken = account.refresh_token;
        token.idToken = account.id_token;
        token.user = {
          id: profile?.sub || user.id,
          name: user.name,
          email: user.email,
          username: (user as any).username,
        };
        if (account.refresh_token && profile?.sub) {
          try {
            const { GetStorage } = await import(
              "@/lib/auth/token-vault-factory"
            );
            const store = GetStorage();
            const expiresAt = getExpirationDate(TokenExpirationDict.Refresh);

            const persistentTokenId = await store.upsertRefreshToken(
              profile.sub,
              account.refresh_token,
              expiresAt,
              account.session_state,
              {
                name: user.name,
                provider: account.provider,
                loginTime: new Date().toISOString(),
              }
            );

            token.persistentTokenId = persistentTokenId;
            console.info("[vault.store]", {
              component: "NextAuth",
              operation: "upsertRefreshToken",
              userId: profile?.sub || user.id,
              persistentTokenId,
            });
          } catch (err) {
            console.error("vault.error", {
              component: "NextAuth",
              operation: "upsertRefreshToken",
              userId: profile?.sub || user.id,
            });
          }
        }

        return token;
      }

      // Return previous token if the access token has not expired / is not close to expiration yet.
      // Refresh proactively 2 minutes before expiration
      if (
        typeof token.accessTokenExpires === "number" &&
        Date.now() < token.accessTokenExpires - ms("2m")
      ) {
        return token;
      }

      // Access token has expired, try to update it
      return await refreshAccessToken(token);
    },
    async session({ session, token }) {
      return {
        ...session,
        user: {
          ...session.user,
          ...token.user,
        },
        accessToken: token.accessToken,
        idToken: token.idToken,
        persistentTokenId: token.persistentTokenId,
        error: token.error,
      };
    },
  },
  session: {
    strategy: "jwt",
    maxAge: ms("10h") / 1000,
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
} satisfies NextAuthOptions;

function auth(
  ...args:
    | [GetServerSidePropsContext["req"], GetServerSidePropsContext["res"]]
    | [NextApiRequest, NextApiResponse]
    | []
) {
  return getServerSession(...args, authOptions);
}

export { auth };
