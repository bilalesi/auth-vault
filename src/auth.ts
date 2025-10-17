import {
  getServerSession,
  type NextAuthOptions,
  type Session as NextAuthSession,
} from "next-auth";
import { type JWT } from "next-auth/jwt";

// Extend the built-in session types
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
    persistentTokenId?: string; // ID for accessing refresh token from vault
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

const issuer = process.env.KEYCLOAK_ISSUER!;
const clientId = process.env.KEYCLOAK_CLIENT_ID!;
const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET!;

/**
 * Takes a token, and returns a new token with updated
 * `accessToken` and `accessTokenExpires`. If an error occurs,
 * returns the old token and an error property
 */
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

    const oldRefreshToken = token.refreshToken;
    const newRefreshToken = refreshedTokens.refresh_token ?? token.refreshToken;

    token.accessToken = refreshedTokens.access_token;
    token.accessTokenExpires = Date.now() + refreshedTokens.expires_in * 1000;
    token.refreshToken = newRefreshToken;

    // Update refresh token in Token Vault if it changed
    if (
      newRefreshToken !== oldRefreshToken &&
      token.persistentTokenId &&
      token.user?.id
    ) {
      try {
        const { getTokenVault } = await import(
          "@/lib/auth/token-vault-factory"
        );
        const tokenVault = getTokenVault();

        // Delete old token and store new one with same persistentTokenId
        await tokenVault.delete(token.persistentTokenId);

        // Calculate new expiration (12 hours for refresh tokens)
        const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

        // Store with the same persistentTokenId to maintain consistency
        await tokenVault.store(
          token.user.id,
          newRefreshToken,
          "refresh",
          expiresAt,
          {
            email: token.user.email,
            name: token.user.name,
            updatedAt: new Date().toISOString(),
          }
        );

        console.log("Refresh token updated in vault:", token.persistentTokenId);
      } catch (error) {
        console.error("Failed to update refresh token in vault:", error);
        // Don't fail the refresh if vault update fails
      }
    }

    return token;
  } catch (error) {
    // TODO: log to Sentry once it's enabled
    // eslint-disable-next-line no-console
    console.log(error);

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

      // next-auth package requires clientSecret because it supports only confidential clients,
      // while Keycloak SBO client is configured to be public and doesn't require it.
      clientSecret,

      // Manually specify endpoints and issuer to avoid Keycloak's incorrect issuer URL
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
      // Initial sign in
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

        // Store refresh token in Token Vault for external services
        if (account.refresh_token && profile?.sub) {
          try {
            const { getTokenVault } = await import(
              "@/lib/auth/token-vault-factory"
            );
            const tokenVault = getTokenVault();

            // Calculate expiration (12 hours for refresh tokens)
            const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

            const persistentTokenId = await tokenVault.store(
              profile.sub,
              account.refresh_token,
              "refresh",
              expiresAt,
              {
                email: user.email,
                name: user.name,
              }
            );

            token.persistentTokenId = persistentTokenId;
            console.log("Refresh token stored in vault:", persistentTokenId);
          } catch (error) {
            console.error("Failed to store refresh token in vault:", error);
            // Don't fail the login if vault storage fails
          }
        }

        return token;
      }

      // Return previous token if the access token has not expired / is not close to expiration yet.
      if (
        typeof token.accessTokenExpires === "number" &&
        Date.now() < token.accessTokenExpires - 2 * 60 * 1000
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
    maxAge: 10 * 60 * 60, // 10 hours
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
