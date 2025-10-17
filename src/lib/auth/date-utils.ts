import ms from "ms";

/**
 * Token expiration durations (human-readable)
 */
export const TokenExpirationDict = {
  access: "1h",
  refresh: "12h",
  offline: "10d",
  session: "10h",
} as const;

/**
 * Extract token expiration type
 */
export type TokenExpirationType =
  (typeof TokenExpirationDict)[keyof typeof TokenExpirationDict];

/**
 * Calculate expiration date from now
 * @param duration - Human-readable duration (e.g., "1h", "12h", "10d")
 * @returns Date object representing the expiration time
 */
export function getExpirationDate(duration: ms.StringValue): Date {
  const milliseconds = ms(duration);
  return new Date(Date.now() + milliseconds);
}

/**
 * Calculate TTL in seconds from expiration date
 * @param expiresAt - Expiration date
 * @returns TTL in seconds (minimum 1 second)
 */
export function getTTLSeconds(expiresAt: Date): number {
  return Math.max(Math.floor((expiresAt.getTime() - Date.now()) / 1000), 1);
}

/**
 * Check if a date has expired
 * @param expiresAt - Expiration date
 * @returns true if expired, false otherwise
 */
export function isExpired(expiresAt: Date): boolean {
  return expiresAt < new Date();
}
