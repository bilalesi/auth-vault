import { GetStorage } from "@/services/auth-manager/auth/token-vault-factory";

export interface UpsertRefreshTokenParams {
  userId: string;
  refreshToken: string;
  sessionState?: string;
  metadata?: Record<string, any>;
}

/**
 * Server-only vault operation to upsert a refresh token
 * This isolates server-only dependencies from the main auth module
 */
export async function upsertRefreshTokenToVault(
  params: UpsertRefreshTokenParams
): Promise<void> {
  try {
    const store = GetStorage();

    await store.upsertRefreshToken({
      sessionStateId: params.sessionState!,
      token: params.refreshToken,
      userId: params.userId,
      metadata: {},
    });
  } catch (err) {
    // Don't fail the operation if vault update fails
    console.error("vault.error", {
      userId: params.userId,
      error: err,
    });
  }
}
