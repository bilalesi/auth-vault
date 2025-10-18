import { eq, lt } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { AuthVault } from "@/lib/db/schema";
import {
  OfflineTokenStatusDict,
  VaultTokenTypeDict,
  type IStorage,
  type TokenVaultEntry,
  type VaultTokenType,
} from "./token-vault-interface";
import { encryptToken, decryptToken, generateIV } from "./encryption";
import { generatePersistentTokenId } from "./uuid";
import {
  AuthManagerError,
  AuthManagerErrorDict,
  AuthManagerOperationDict,
  AuthManagerStorageTypeDict,
} from "./vault-errors";
import { isExpired } from "./date-utils";

/**
 * PostgreSQL implementation of TokenVault using Drizzle ORM
 */
export class PgStorage implements IStorage {
  private db = getDb();

  async create(
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
        await this.db.delete(AuthVault).where(eq(AuthVault.id, tokenId));
      }

      await this.db.insert(AuthVault).values({
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
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: AuthManagerOperationDict.store,
        userId,
        persistentTokenId: tokenId,
        storageType: AuthManagerStorageTypeDict.postgres,
        originalError: error,
      });
    }
  }

  async retrieve(tokenId: string): Promise<TokenVaultEntry | null> {
    try {
      const result = await this.db
        .select()
        .from(AuthVault)
        .where(eq(AuthVault.id, tokenId))
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

      // Decrypt the token if it exists
      const decryptedToken =
        row.encryptedToken && row.iv
          ? decryptToken(row.encryptedToken, row.iv)
          : null;

      return {
        id: row.id,
        userId: row.userId,
        tokenType: row.tokenType as VaultTokenType,
        encryptedToken: decryptedToken, // Return decrypted token
        iv: row.iv,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        metadata: row.metadata as Record<string, any> | undefined,
        status: row.status as any,
        taskId: row.taskId || undefined,
        stateToken: row.stateToken || undefined,
      };
    } catch (error) {
      throw new AuthManagerError("storage_error", {
        operation: AuthManagerOperationDict.retrieve,
        persistentTokenId: tokenId,
        storageType: AuthManagerStorageTypeDict.postgres,
        originalError: error,
      });
    }
  }

  async delete(tokenId: string): Promise<void> {
    try {
      await this.db.delete(AuthVault).where(eq(AuthVault.id, tokenId));
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: AuthManagerOperationDict.delete,
        persistentTokenId: tokenId,
        storageType: AuthManagerStorageTypeDict.postgres,
        originalError: error,
      });
    }
  }

  async cleanup(): Promise<number> {
    try {
      const result = await this.db
        .delete(AuthVault)
        .where(lt(AuthVault.expiresAt, new Date()))
        .returning({ id: AuthVault.id });

      return result.length;
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.cleanup_error.code, {
        operation: AuthManagerOperationDict.cleanup,
        storageType: AuthManagerStorageTypeDict.postgres,
        originalError: error,
      });
    }
  }

  async getUserTokens(userId: string): Promise<TokenVaultEntry[]> {
    try {
      const results = await this.db
        .select()
        .from(AuthVault)
        .where(eq(AuthVault.userId, userId));

      return results
        .filter((row) => !isExpired(row.expiresAt))
        .map((row) => ({
          id: row.id,
          userId: row.userId,
          tokenType: row.tokenType as VaultTokenType,
          encryptedToken:
            row.encryptedToken && row.iv
              ? decryptToken(row.encryptedToken, row.iv)
              : null,
          iv: row.iv,
          createdAt: row.createdAt,
          expiresAt: row.expiresAt,
          metadata: row.metadata as Record<string, any> | undefined,
          status: row.status as any,
          taskId: row.taskId || undefined,
          stateToken: row.stateToken || undefined,
        }));
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: AuthManagerOperationDict.get_user_tokens,
        userId,
        storageType: AuthManagerStorageTypeDict.postgres,
        originalError: error,
      });
    }
  }

  async makePendingOfflineToken(
    userId: string,
    taskId: string,
    stateToken: string | null,
    expiresAt: Date,
    metadata?: Record<string, any>
  ): Promise<string> {
    try {
      const id = generatePersistentTokenId();
      await this.db.insert(AuthVault).values({
        id,
        userId,
        tokenType: VaultTokenTypeDict.Offline,
        encryptedToken: null,
        iv: null,
        expiresAt,
        metadata: metadata || null,
        status: OfflineTokenStatusDict.Pending,
        taskId,
        stateToken,
      });

      return id;
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: AuthManagerOperationDict.store,
        userId,
        storageType: AuthManagerStorageTypeDict.postgres,
        originalError: error,
      });
    }
  }

  async updateOfflineTokenByState(
    stateToken: string,
    token: string | null,
    status: any
  ): Promise<TokenVaultEntry | null> {
    try {
      const existing = await this.db
        .select()
        .from(AuthVault)
        .where(eq(AuthVault.stateToken, stateToken))
        .limit(1);

      if (existing.length === 0) {
        // should throw VaultError
        return null;
      }

      const row = existing[0];

      let encryptedToken: string | null = null;
      let iv: string | null = null;

      if (token) {
        iv = generateIV();
        encryptedToken = encryptToken(token, iv);
      }

      // Update the entry
      await this.db
        .update(AuthVault)
        .set({
          encryptedToken,
          iv,
          status,
        })
        .where(eq(AuthVault.id, row.id));

      return {
        id: row.id,
        userId: row.userId,
        tokenType: row.tokenType as VaultTokenType,
        encryptedToken: token,
        iv: iv || row.iv,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        metadata: row.metadata as Record<string, any> | undefined,
        status: status as any,
        taskId: row.taskId || undefined,
        stateToken: row.stateToken || undefined,
      };
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: AuthManagerOperationDict.store,
        storageType: AuthManagerStorageTypeDict.postgres,
        originalError: error,
      });
    }
  }

  async getByStateToken(stateToken: string): Promise<TokenVaultEntry | null> {
    try {
      const result = await this.db
        .select()
        .from(AuthVault)
        .where(eq(AuthVault.stateToken, stateToken))
        .limit(1);

      if (result.length === 0) {
        return null;
      }

      const row = result[0];

      return {
        id: row.id,
        userId: row.userId,
        tokenType: row.tokenType as VaultTokenType,
        encryptedToken:
          row.encryptedToken && row.iv
            ? decryptToken(row.encryptedToken, row.iv)
            : null,
        iv: row.iv,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        metadata: row.metadata as Record<string, any> | undefined,
        status: row.status as any,
        taskId: row.taskId || undefined,
        stateToken: row.stateToken || undefined,
      };
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: AuthManagerOperationDict.retrieve,
        storageType: AuthManagerStorageTypeDict.postgres,
        originalError: error,
      });
    }
  }

  async updateStateToken(tokenId: string, stateToken: string): Promise<void> {
    try {
      await this.db
        .update(AuthVault)
        .set({ stateToken })
        .where(eq(AuthVault.id, tokenId));
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: AuthManagerOperationDict.store,
        persistentTokenId: tokenId,
        storageType: AuthManagerStorageTypeDict.postgres,
        originalError: error,
      });
    }
  }
}
