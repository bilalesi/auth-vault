import { AuthLogEventDict, logger } from "../logger";

export interface TStateTokenPayload {
  userId: string;
  taskId: string;
  persistentTokenId: string;
}

/**
 * Generate a state token from payload
 * encodes userId, taskId, and persistentTokenId as a base64 string.
 * format: base64(userId:taskId:persistentTokenId)
 *
 * @param payload - State token payload
 * @returns Base64 encoded state token
 */
export function generateStateToken(payload: TStateTokenPayload): string {
  const stateString = `${payload.userId}:${payload.taskId}:${payload.persistentTokenId}`;
  return Buffer.from(stateString, "utf-8").toString("base64url");
}

/**
 * Parse a state token back to payload
 * decodes a base64 state token back to its components.
 *
 * @param ackToken - Base64 encoded state token
 * @returns Parsed state token payload or null if invalid
 */
export function parseAckState(ackToken: string): TStateTokenPayload | null {
  try {
    const decoded = Buffer.from(ackToken, "base64url").toString("utf-8");
    const parts = decoded.split(":");

    if (parts.length !== 3) {
      return null;
    }

    const [userId, taskId, persistentTokenId] = parts;

    if (!userId || !taskId || !persistentTokenId) {
      return null;
    }

    return {
      userId,
      taskId,
      persistentTokenId,
    };
  } catch (err) {
    logger.info(AuthLogEventDict.parsing, {
      component: "KeycloakUrlState",
      operation: "parseAckState",
      originalError: err,
    });
    return null;
  }
}
