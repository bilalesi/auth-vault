import { NextRequest } from "next/server";
import { GetStorage } from "@/lib/auth/token-vault-factory";
import { validateRequest } from "@/lib/auth/validate-token";
import { makeResponse, makeVaultError, throwError } from "@/lib/auth/response";
import {
  AuthManagerError,
  AuthManagerErrorDict,
} from "@/lib/auth/vault-errors";

export async function GET(request: NextRequest) {
  try {
    const validation = await validateRequest(request);

    if (!validation.valid || !validation.userId) {
      return makeVaultError(
        new AuthManagerError(AuthManagerErrorDict.unauthorized.code)
      );
    }

    const vault = GetStorage();
    const tokens = await vault.retrieveUserOfflineTokens(validation.userId);

    const safeTokens = tokens.map((token) => ({
      id: token.id,
      userId: token.userId,
      tokenType: token.tokenType,
      status: token.status,
      taskId: token.taskId,
      sessionState: token.sessionState,
      createdAt: token.createdAt,
      expiresAt: token.expiresAt,
      metadata: token.metadata,
    }));

    return makeResponse({
      tokens: safeTokens,
      count: safeTokens.length,
    });
  } catch (error) {
    return throwError(error);
  }
}
