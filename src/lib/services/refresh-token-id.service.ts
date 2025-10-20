import { GetStorage } from "@/lib/auth/token-vault-factory";
import {
  AuthManagerError,
  AuthManagerErrorDict,
} from "@/lib/auth/vault-errors";

export interface RefreshTokenIdParams {
  userId: string;
}

export interface RefreshTokenIdResult {
  persistentTokenId: string;
  expiresAt: string;
}

/**
 * Retrieves the user's refresh token ID and expiration time.
 *
 * This function fetches the user's refresh token from the storage vault
 * and returns the persistent token ID along with its expiration timestamp.
 *
 * @param params - Object containing the userId
 * @returns Object containing the persistentTokenId and expiresAt timestamp
 * @throws {AuthManagerError} If the refresh token is not found for the user
 */
export async function getRefreshTokenId(
  params: RefreshTokenIdParams
): Promise<RefreshTokenIdResult> {
  const { userId } = params;

  const vault = GetStorage();
  const entry = await vault.getUserRefreshToken(userId);

  if (!entry) {
    throw new AuthManagerError(AuthManagerErrorDict.no_refresh_token.code, {
      userId,
    });
  }

  return {
    persistentTokenId: entry.id,
    expiresAt: entry.expiresAt.toISOString(),
  };
}
