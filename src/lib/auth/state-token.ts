/**
 * State Token Utilities
 *
 * Generates and parses OAuth state tokens for offline token consent flow.
 * State tokens encode userId, taskId, and persistentTokenId for tracking.
 */

/**
 * State token payload
 */
export interface StateTokenPayload {
  userId: string;
  taskId: string;
  persistentTokenId: string;
}

/**
 * Generate a state token from payload
 *
 * Encodes userId, taskId, and persistentTokenId as a base64 string.
 * Format: base64(userId:taskId:persistentTokenId)
 *
 * @param payload - State token payload
 * @returns Base64 encoded state token
 *
 * @example
 * ```typescript
 * const state = generateStateToken({
 *   userId: "user-123",
 *   taskId: "task-456",
 *   persistentTokenId: "token-789"
 * });
 * // Returns: "dXNlci0xMjM6dGFzay00NTY6dG9rZW4tNzg5"
 * ```
 */
export function generateStateToken(payload: StateTokenPayload): string {
  const stateString = `${payload.userId}:${payload.taskId}:${payload.persistentTokenId}`;
  return Buffer.from(stateString, "utf-8").toString("base64url");
}

/**
 * Parse a state token back to payload
 *
 * Decodes a base64 state token back to its components.
 *
 * @param stateToken - Base64 encoded state token
 * @returns Parsed state token payload or null if invalid
 *
 * @example
 * ```typescript
 * const payload = parseStateToken("dXNlci0xMjM6dGFzay00NTY6dG9rZW4tNzg5");
 * // Returns: { userId: "user-123", taskId: "task-456", persistentTokenId: "token-789" }
 * ```
 */
export function parseStateToken(stateToken: string): StateTokenPayload | null {
  try {
    const decoded = Buffer.from(stateToken, "base64url").toString("utf-8");
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
  } catch (error) {
    console.error("Error parsing state token:", error);
    return null;
  }
}

/**
 * Validate a state token format
 *
 * @param stateToken - State token to validate
 * @returns True if valid format
 */
export function isValidStateToken(stateToken: string): boolean {
  return parseStateToken(stateToken) !== null;
}
