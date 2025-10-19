import ms from "ms";

export const TokenExpirationDict = {
  Access: "1h",
  Refresh: "12h",
  Offline: "10d",
  Session: "10h",
} as const;

export type TokenExpirationType =
  (typeof TokenExpirationDict)[keyof typeof TokenExpirationDict];

/**
 * Calculates the expiration date based on the current time and a given duration.
 *
 * @param duration - A string value representing the duration in a format
 *                   supported by the `ms` library (e.g., "2d", "1h", "30m").
 * @returns A `Date` object representing the expiration date and time.
 */
export function getExpirationDate(duration: ms.StringValue): Date {
  const milliseconds = ms(duration);
  return new Date(Date.now() + milliseconds);
}

/**
 * Calculates the time-to-live (ttl) in seconds based on the provided expiration date.
 *
 * @param expiresAt - The expiration date as a `Date` object.
 * @returns The ttl in seconds. Returns at least 1 second if the calculated TTL is less than 1.
 */
export function getTTLSeconds(expiresAt: Date): number {
  return Math.max(Math.floor((expiresAt.getTime() - Date.now()) / 1000), 1);
}

/**
 * Determines whether a given date has expired.
 *
 * @param expiresAt - The date to check against the current date and time.
 * @returns `true` if the provided date is in the past, otherwise `false`.
 */
export function isExpired(expiresAt: Date): boolean {
  return expiresAt < new Date();
}
