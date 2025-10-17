import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 16 bytes for AES
const AUTH_TAG_LENGTH = 16; // 16 bytes for GCM auth tag
const KEY_LENGTH = 32; // 32 bytes for AES-256

/**
 * Get encryption key from environment
 */
function getEncryptionKey(): Buffer {
  const key = process.env.TOKEN_VAULT_ENCRYPTION_KEY;

  if (!key) {
    throw new Error(
      "TOKEN_VAULT_ENCRYPTION_KEY environment variable is not set"
    );
  }

  // Convert hex string to buffer
  const keyBuffer = Buffer.from(key, "hex");

  if (keyBuffer.length !== KEY_LENGTH) {
    throw new Error(
      `Encryption key must be ${KEY_LENGTH} bytes (${
        KEY_LENGTH * 2
      } hex characters). ` +
        `Current key is ${keyBuffer.length} bytes. ` +
        `Generate a new key with: openssl rand -hex 32`
    );
  }

  return keyBuffer;
}

/**
 * Generate a random initialization vector
 */
export function generateIV(): string {
  return randomBytes(IV_LENGTH).toString("hex");
}

/**
 * Encrypt a token using AES-256-GCM
 * @param token - The token to encrypt
 * @param iv - Initialization vector (hex string)
 * @returns Encrypted token (hex string with auth tag appended)
 */
export function encryptToken(token: string, iv: string): string {
  try {
    const key = getEncryptionKey();
    const ivBuffer = Buffer.from(iv, "hex");

    if (ivBuffer.length !== IV_LENGTH) {
      throw new Error(`IV must be ${IV_LENGTH} bytes`);
    }

    const cipher = createCipheriv(ALGORITHM, key, ivBuffer);

    let encrypted = cipher.update(token, "utf8", "hex");
    encrypted += cipher.final("hex");

    // Get the auth tag and append it to the encrypted data
    const authTag = cipher.getAuthTag();
    encrypted += authTag.toString("hex");

    return encrypted;
  } catch (error) {
    console.error("Error encrypting token:", error);
    throw new Error("Failed to encrypt token");
  }
}

/**
 * Decrypt a token using AES-256-GCM
 * @param encryptedToken - The encrypted token (hex string with auth tag appended)
 * @param iv - Initialization vector (hex string)
 * @returns Decrypted token
 */
export function decryptToken(encryptedToken: string, iv: string): string {
  try {
    const key = getEncryptionKey();
    const ivBuffer = Buffer.from(iv, "hex");

    if (ivBuffer.length !== IV_LENGTH) {
      throw new Error(`IV must be ${IV_LENGTH} bytes`);
    }

    // Extract the auth tag from the end of the encrypted data
    const authTagStart = encryptedToken.length - AUTH_TAG_LENGTH * 2; // 2 hex chars per byte
    const encryptedData = encryptedToken.slice(0, authTagStart);
    const authTag = Buffer.from(encryptedToken.slice(authTagStart), "hex");

    const decipher = createDecipheriv(ALGORITHM, key, ivBuffer);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("Error decrypting token:", error);
    throw new Error("Failed to decrypt token");
  }
}

/**
 * Validate encryption key format
 * @returns true if valid, throws error if invalid
 */
export function validateEncryptionKey(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch (error) {
    throw error;
  }
}
