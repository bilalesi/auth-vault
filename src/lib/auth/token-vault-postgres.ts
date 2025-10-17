import { eq, lt } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { tokenVault } from "@/lib/db/schema";
import type {
  IStorage,
  TokenVaultEntry,
  VaultTokenType,
} from "./token-vault-interface";
import { encryptToken, decryptToken, generateIV } from "./encryption";
import { generatePersistentTokenId } from "./uuid";
import {
  VaultError,
  VaultErrorCodeDict,
  VaultOperationDict,
  VaultStorageTypeDict,
} from "./vault-errors";
import { isExpired } from "./date-utils";

/**
 * PostgreSQL implementation of TokenVault using Drizzle ORM
 */
export class PgStorage implements IStorage {
  private db = getDb();

  async store(
    userId: string,
    token: string,
    type: VaultTokenType,
    expiresAt: Date,
    metadata?: Record<string, any>,
    tokenId?: string
  ): Promise<string> {
    try {
      const id = tokenId || generatePersistentTokenId();
      const iv = generateIV();
      const encryptedToken = encryptToken(token, iv);

      // If tokenId provided, delete existing entry first (upsert behavior)
      if (tokenId) {
        await this.db.delete(tokenVault).where(eq(tokenVault.id, tokenId));
      }

      await this.db.insert(tokenVault).values({
        id,
        userId,
        tokenType: type,
        encryptedToken,
        iv,
        expiresAt,
        metadata: metadata || null,
      });

      return id;
    } catch (error) {
      throw new VaultError(VaultErrorCodeDict.storage_error, {
        operation: VaultOperationDict.store,
        userId,
        persistentTokenId: tokenId,
        storageType: VaultStorageTypeDict.postgres,
        originalError: error,
      });
    }
  }

  async retrieve(tokenId: string): Promise<TokenVaultEntry | null> {
    try {
      const result = await this.db
        .select()
        .from(tokenVault)
        .where(eq(tokenVault.id, tokenId))
        .limit(1);

      if (result.length === 0) {
        return null;
      }

      const row = result[0];

      // Check if token has expired
      if (isExpired(row.expiresAt)) {
        // Delete expired token
        await this.delete(tokenId);
        return null;
      }

      // Decrypt the token
      const decryptedToken = decryptToken(row.encryptedToken, row.iv);

      return {
        id: row.id,
        userId: row.userId,
        tokenType: row.tokenType as VaultTokenType,
        encryptedToken: decryptedToken, // Return decrypted token
        iv: row.iv,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        metadata: row.metadata as Record<string, any> | undefined,
      };
    } catch (error) {
      throw new VaultError(VaultErrorCodeDict.storage_error, {
        operation: VaultOperationDict.retrieve,
        persistentTokenId: tokenId,
        storageType: VaultStorageTypeDict.postgres,
        originalError: error,
      });
    }
  }

  async delete(tokenId: string): Promise<void> {
    try {
      await this.db.delete(tokenVault).where(eq(tokenVault.id, tokenId));
    } catch (error) {
      throw new VaultError(VaultErrorCodeDict.storage_error, {
        operation: VaultOperationDict.delete,
        persistentTokenId: tokenId,
        storageType: VaultStorageTypeDict.postgres,
        originalError: error,
      });
    }
  }

  async cleanup(): Promise<number> {
    try {
      const result = await this.db
        .delete(tokenVault)
        .where(lt(tokenVault.expiresAt, new Date()))
        .returning({ id: tokenVault.id });

      return result.length;
    } catch (error) {
      throw new VaultError(VaultErrorCodeDict.cleanup_error, {
        operation: VaultOperationDict.cleanup,
        storageType: VaultStorageTypeDict.postgres,
        originalError: error,
      });
    }
  }

  async getUserTokens(userId: string): Promise<TokenVaultEntry[]> {
    try {
      const results = await this.db
        .select()
        .from(tokenVault)
        .where(eq(tokenVault.userId, userId));

      return results
        .filter((row) => !isExpired(row.expiresAt)) // Filter out expired
        .map((row) => ({
          id: row.id,
          userId: row.userId,
          tokenType: row.tokenType as VaultTokenType,
          encryptedToken: decryptToken(row.encryptedToken, row.iv),
          iv: row.iv,
          createdAt: row.createdAt,
          expiresAt: row.expiresAt,
          metadata: row.metadata as Record<string, any> | undefined,
        }));
    } catch (error) {
      throw new VaultError(VaultErrorCodeDict.storage_error, {
        operation: VaultOperationDict.get_user_tokens,
        userId,
        storageType: VaultStorageTypeDict.postgres,
        originalError: error,
      });
    }
  }
}
