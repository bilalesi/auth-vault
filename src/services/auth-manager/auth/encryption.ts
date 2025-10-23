import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
} from "crypto";

import {
  AuthManagerError,
  AuthManagerErrorDict,
} from "@/services/auth-manager/auth/vault-errors";
import { AuthLogEventDict, logger } from "@/services/auth-manager/logger";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 16 bytes for AES
const AUTH_TAG_LENGTH = 16; // 16 bytes for GCM auth tag
const KEY_LENGTH = 32; // 32 bytes for AES-256

/**
 * Get encryption key from environment
 *
 * Retrieves and validates the AUTH_MANAGER_TOKEN_VAULT_ENCRYPTION_KEY from environment variables.
 * The key must be a 64-character hex string (32 bytes).
 *
 * @returns Buffer containing the encryption key
 * @throws {AuthManagerError} If key is missing or invalid format
 */
function getEncryptionKey(): Buffer {
  const key = process.env.AUTH_MANAGER_TOKEN_VAULT_ENCRYPTION_KEY;

  if (!key) {
    throw new AuthManagerError(AuthManagerErrorDict.encryption_failed.code, {
      reason:
        "AUTH_MANAGER_TOKEN_VAULT_ENCRYPTION_KEY environment variable is not set",
      operation: "getEncryptionKey",
    });
  }

  // Convert hex string to buffer
  const keyBuffer = Buffer.from(key, "hex");

  if (keyBuffer.length !== KEY_LENGTH) {
    throw new AuthManagerError(AuthManagerErrorDict.encryption_failed.code, {
      reason: `Encryption key must be ${KEY_LENGTH} bytes (${
        KEY_LENGTH * 2
      } hex characters). Current key is ${keyBuffer.length} bytes.`,
      hint: "Generate a new key with: openssl rand -hex 32",
      operation: "getEncryptionKey",
    });
  }

  return keyBuffer;
}

/**
 * Generate a random initialization vector (IV)
 *
 * Creates a cryptographically secure random 16-byte IV for use with AES-256-GCM.
 * Each encryption operation MUST use a unique IV to ensure security.
 *
 * The IV is not secret and should be stored alongside the encrypted data.
 *
 * @returns 32-character hex string (16 bytes)
 */
export function generateIV(): string {
  return randomBytes(IV_LENGTH).toString("hex");
}

/**
 * Hash a token using SHA-256
 *
 * Creates a SHA-256 hash of a token for deduplication and comparison purposes.
 * This is a one-way hash - the original token cannot be recovered from the hash.
 *
 * **Use Cases:**
 * - Detect duplicate offline tokens across multiple persistent token IDs
 * - Check if any other tasks are using the same offline token before revocation
 * - Compare tokens without decrypting them
 *
 * @param token - The plaintext token to hash
 * @returns SHA-256 hash as hex string (64 characters)
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Encrypt a token using AES-256-GCM
 *
 * Encrypts a plaintext token using AES-256-GCM encryption with the provided IV.
 * The authentication tag is automatically appended to the encrypted data.
 *
 * **Security Notes:**
 * - Always use a unique IV for each encryption (use `generateIV()`)
 * - Never reuse an IV with the same key
 * - The IV must be stored with the encrypted data for decryption
 *
 * @param token - The plaintext token to encrypt (typically a JWT refresh token)
 * @param iv - Initialization vector as 32-character hex string (from `generateIV()`)
 * @returns Encrypted token as hex string with auth tag appended
 * @throws {AuthManagerError} If encryption fails or IV is invalid
 */
export function encryptToken(token: string, iv: string): string {
  try {
    const key = getEncryptionKey();
    const ivBuffer = Buffer.from(iv, "hex");

    if (ivBuffer.length !== IV_LENGTH) {
      throw new AuthManagerError(AuthManagerErrorDict.encryption_failed.code, {
        reason: `IV must be ${IV_LENGTH} bytes (${
          IV_LENGTH * 2
        } hex characters)`,
        actualLength: ivBuffer.length,
        operation: "encryptToken",
      });
    }

    const cipher = createCipheriv(ALGORITHM, key, ivBuffer);

    let encrypted = cipher.update(token, "utf8", "hex");
    encrypted += cipher.final("hex");

    // Get the auth tag and append it to the encrypted data
    const authTag = cipher.getAuthTag();
    encrypted += authTag.toString("hex");

    return encrypted;
  } catch (err) {
    logger.vault(AuthLogEventDict.encryptionError, {
      originalError: err,
    });

    if (AuthManagerError.is(err)) {
      throw err;
    }
    throw new AuthManagerError("encryption_failed", {
      originalError: err,
    });
  }
}

/**
 * Decrypt a token using AES-256-GCM
 *
 * Decrypts an encrypted token using AES-256-GCM with the provided IV.
 * The authentication tag is automatically verified during decryption.
 *
 * **Security Notes:**
 * - If the auth tag verification fails, the data has been tampered with
 * - Wrong key or IV will cause decryption to fail
 * - Corrupted data will be detected by the auth tag
 *
 * @param encryptedToken - The encrypted token as hex string (with auth tag appended)
 * @param iv - The same initialization vector used during encryption (32-char hex string)
 * @returns Decrypted plaintext token
 * @throws {AuthManagerError} If decryption fails, auth tag invalid, or data tampered
 */
export function decryptToken(encryptedToken: string, iv: string): string {
  try {
    const key = getEncryptionKey();
    const ivBuffer = Buffer.from(iv, "hex");

    if (ivBuffer.length !== IV_LENGTH) {
      throw new AuthManagerError(AuthManagerErrorDict.decryption_failed.code, {
        reason: `IV must be ${IV_LENGTH} bytes (${
          IV_LENGTH * 2
        } hex characters)`,
        actualLength: ivBuffer.length,
      });
    }

    // Extract the auth tag from the end of the encrypted data
    const authTagStart = encryptedToken.length - AUTH_TAG_LENGTH * 2; // 2 hex chars per byte
    const encryptedData = encryptedToken.slice(0, authTagStart);
    const authTag = Buffer.from(encryptedToken.slice(authTagStart), "hex");

    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new AuthManagerError(AuthManagerErrorDict.decryption_failed.code, {
        reason: "Invalid auth tag length, data may be corrupted",
        expectedLength: AUTH_TAG_LENGTH,
        actualLength: authTag.length,
      });
    }

    const decipher = createDecipheriv(ALGORITHM, key, ivBuffer);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (err) {
    logger.vault(AuthLogEventDict.decryptionError, {
      originalError: err,
    });
    if (AuthManagerError.is(err)) {
      throw err;
    }
    throw new AuthManagerError(AuthManagerErrorDict.decryption_failed.code, {
      originalError: err,
      hint: "Data may be corrupted, tampered with, or encrypted with a different key",
    });
  }
}
