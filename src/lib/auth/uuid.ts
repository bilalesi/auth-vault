import { randomUUID } from "crypto";

/**
 * Generate a unique persistent token ID
 * Uses crypto.randomUUID() for cryptographically secure UUIDs
 */
export function generatePersistentTokenId(): string {
  return randomUUID();
}
