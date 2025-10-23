import { randomUUID } from 'crypto';

/**
 * Generates a new universally unique identifier (UUID).
 *
 * @returns {string} A string representation of a UUID.
 */
export function makeUUID(): string {
  return randomUUID();
}
