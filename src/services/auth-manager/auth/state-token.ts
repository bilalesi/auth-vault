import { AuthLogEventDict, logger } from "@/services/auth-manager/logger";
import z from "zod";

export interface TStateTokenPayload {
  userId: string;
  sessionStateId: string;
}

const AckKeycloakStateSchema = z.object({
  sessionState: z
    .array(z.string())
    .min(2, { error: "Session state has less properties" })
    .max(2, { error: "Session state has more properties" }),
});

/**
 * Generate a state token from payload
 * encodes userId,  and sessionStateId as a base64 string.
 * format: base64(userId:persistentTokenId)
 *
 * @param payload - State token payload
 * @returns Base64 encoded state token
 */
export function makeKeycloakRequestState(payload: TStateTokenPayload): string {
  const stateString = `${payload.userId}:${payload.sessionStateId}`;
  return Buffer.from(stateString, "utf-8").toString("base64url");
}

/**
 * Parse a state token back to payload
 * decodes a base64 state token back to its components.
 *
 * @param ackToken - Base64 encoded state token
 * @returns Parsed state token payload or null if invalid
 */
export async function parseAckKeycloakRequestState(
  ackToken: string | null
): Promise<TStateTokenPayload | null> {
  if (!ackToken) return null;
  try {
    const decoded = Buffer.from(ackToken, "base64url").toString("utf-8");
    const parts = decoded.split(":");

    const {
      sessionState: [userId, sessionStateId],
    } = await AckKeycloakStateSchema.parseAsync({ sessionState: parts });

    return {
      userId,
      sessionStateId,
    };
  } catch (err) {
    logger.info(AuthLogEventDict.parsing, {
      originalError: err,
    });
    throw err;
  }
}
