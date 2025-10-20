/**
 * Token Encryption Module
 *
 * This module provides secure encryption and decryption for OAuth tokens using AES-256-GCM.
 *
 * ## Overview
 *
 * AES-256-GCM (Galois/Counter Mode) is an authenticated encryption algorithm that provides:
 * - **Confidentiality**: Data is encrypted and cannot be read without the key
 * - **Integrity**: Any tampering with the encrypted data is detected
 * - **Authentication**: Verifies the data hasn't been modified
 *
 * ## How It Works
 *
 * ### Encryption Process:
 * 1. Generate a random Initialization Vector (IV) - 16 bytes
 * 2. Use the encryption key (32 bytes for AES-256) from environment
 * 3. Encrypt the plaintext token using AES-256-GCM
 * 4. Generate an authentication tag (16 bytes) to verify integrity
 * 5. Return encrypted data + auth tag as hex string
 *
 * ### Decryption Process:
 * 1. Split the encrypted data into ciphertext and auth tag
 * 2. Use the same encryption key and IV
 * 3. Verify the auth tag (throws error if tampered)
 * 4. Decrypt and return the plaintext token
 *
 * ## Security Features
 *
 * - **AES-256**: Industry-standard encryption with 256-bit keys
 * - **GCM Mode**: Provides both encryption and authentication
 * - **Unique IVs**: Each encryption uses a random IV (prevents pattern analysis)
 * - **Auth Tags**: Detects any tampering or corruption
 *
 * ## Setup
 *
 * Generate an encryption key:
 * ```bash
 * openssl rand -hex 32
 * ```
 *
 * Add to `.env.local`:
 * ```
 * TOKEN_VAULT_ENCRYPTION_KEY=your_64_character_hex_string
 * ```
 *
 * ## Usage Examples
 *
 * ### Example 1: Encrypting a Token
 * ```typescript
 * import { encryptToken, generateIV } from '@/lib/auth/encryption';
 *
 * const token = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...";
 * const iv = generateIV(); // Random 16-byte IV as hex string
 *
 * const encrypted = encryptToken(token, iv);
 * // encrypted: "a3f2b1c4d5e6..." (hex string with auth tag)
 *
 * // Store both encrypted and iv in database
 * await db.insert({ encryptedToken: encrypted, iv: iv });
 * ```
 *
 * ### Example 2: Decrypting a Token
 * ```typescript
 * import { decryptToken } from '@/lib/auth/encryption';
 *
 * // Retrieve from database
 * const { encryptedToken, iv } = await db.query(...);
 *
 * try {
 *   const token = decryptToken(encryptedToken, iv);
 *   // token: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
 *
 *   // Use the token
 *   await keycloak.refreshAccessToken(token);
 * } catch (error) {
 *   // VaultError thrown if decryption fails
 *   console.error('Decryption failed:', error);
 * }
 * ```
 *
 * ### Example 3: Complete Workflow
 * ```typescript
 * import { encryptToken, decryptToken, generateIV } from '@/lib/auth/encryption';
 *
 * // During login - encrypt and store
 * const refreshToken = "eyJhbGciOiJSUzI1NiI...";
 * const iv = generateIV();
 * const encrypted = encryptToken(refreshToken, iv);
 *
 * await tokenVault.store({
 *   userId: "user-123",
 *   encryptedToken: encrypted,
 *   iv: iv,
 *   tokenType: "refresh"
 * });
 *
 * // Later - retrieve and decrypt
 * const entry = await tokenVault.retrieve("token-id");
 * const decrypted = decryptToken(entry.encryptedToken, entry.iv);
 *
 * // Use decrypted token
 * const newAccessToken = await keycloak.refreshAccessToken(decrypted);
 * ```
 *
 * ## Error Handling
 *
 * All functions throw `VaultError` with specific error codes:
 * - `encryption_failed`: Key missing, invalid format, or encryption error
 * - `decryption_failed`: Invalid data, wrong key, or tampered data
 *
 * ## Important Notes
 *
 * 1. **Never reuse IVs**: Always generate a new IV for each encryption
 * 2. **Store IVs**: The IV must be stored alongside encrypted data (it's not secret)
 * 3. **Key rotation**: Plan for key rotation in production environments
 * 4. **Auth tags**: The auth tag is appended to encrypted data automatically
 * 5. **Hex encoding**: All data is encoded as hex strings for database storage
 *
 * @module encryption
 */

import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
} from "crypto";
import { AuthManagerError, AuthManagerErrorDict } from "./vault-errors";
import { AuthLogEventDict, logger } from "../logger";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 16 bytes for AES
const AUTH_TAG_LENGTH = 16; // 16 bytes for GCM auth tag
const KEY_LENGTH = 32; // 32 bytes for AES-256

/**
 * Get encryption key from environment
 *
 * Retrieves and validates the TOKEN_VAULT_ENCRYPTION_KEY from environment variables.
 * The key must be a 64-character hex string (32 bytes).
 *
 * @returns Buffer containing the encryption key
 * @throws {AuthManagerError} If key is missing or invalid format
 */
function getEncryptionKey(): Buffer {
  const key = process.env.TOKEN_VAULT_ENCRYPTION_KEY;

  if (!key) {
    throw new AuthManagerError(AuthManagerErrorDict.encryption_failed.code, {
      reason: "TOKEN_VAULT_ENCRYPTION_KEY environment variable is not set",
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
    logger.vault(AuthLogEventDict.encryption, {
      component: "Encryption",
      operation: "encryptToken",
      originalError: err,
    });

    if (AuthManagerError.is(err)) {
      throw err;
    }
    throw new AuthManagerError("encryption_failed", {
      originalError: err,
      operation: "encryptToken",
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
        operation: "decryptToken",
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
        operation: "decryptToken",
      });
    }

    const decipher = createDecipheriv(ALGORITHM, key, ivBuffer);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (err) {
    logger.vault(AuthLogEventDict.decryption, {
      component: "Decryption",
      operation: "decryptToken",
      originalError: err,
    });
    if (AuthManagerError.is(err)) {
      throw err;
    }
    throw new AuthManagerError(AuthManagerErrorDict.decryption_failed.code, {
      originalError: err,
      operation: "decryptToken",
      hint: "Data may be corrupted, tampered with, or encrypted with a different key",
    });
  }
}
