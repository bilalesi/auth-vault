import { eq, lt, and, sql } from "drizzle-orm";
import { makeDb } from "@/lib/db/client";
import { AuthVault, TokenStatusValues, TokenTypeEnum } from "@/lib/db/schema";
import {
  OfflineTokenStatusDict,
  AuthManagerTokenTypeDict,
  type IStorage,
  type TokenVaultEntry,
  type TAuthManagerTokenType,
  type OfflineTokenStatus,
} from "./token-vault-interface";
import { encryptToken, decryptToken, generateIV } from "./encryption";
import { makeUUID } from "./uuid";
import {
  AuthManagerError,
  AuthManagerErrorDict,
  AuthManagerOperationDict,
  AuthManagerStorageTypeDict,
} from "./vault-errors";
import { isExpired } from "./date-utils";

export class PgStorage implements IStorage {
  private db = makeDb();

  async create(
    userId: string,
    token: string,
    type: TAuthManagerTokenType,
    expiresAt: Date,
    metadata?: Record<string, any>,
    tokenId?: string
  ): Promise<string> {
    try {
      const id = tokenId || makeUUID();
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
      const row = await this.db.query.AuthVault.findFirst({
        where(fields, operators) {
          return operators.eq(fields.id, tokenId);
        },
      });

      if (!row) return null;

      if (isExpired(row.expiresAt)) {
        await this.delete(tokenId);
        return null;
      }

      const decryptedToken =
        row.encryptedToken && row.iv
          ? decryptToken(row.encryptedToken, row.iv)
          : null;

      return {
        id: row.id,
        userId: row.userId,
        tokenType: row.tokenType as TAuthManagerTokenType,
        encryptedToken: decryptedToken,
        iv: row.iv,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        metadata: row.metadata as Record<string, any> | undefined,
        status: row.status as any,
        taskId: row.taskId || undefined,
        ackState: row.ackState || undefined,
        sessionState: row.sessionState || undefined,
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

  async getUserRefreshToken(userId: string): Promise<TokenVaultEntry | null> {
    try {
      const row = await this.db.query.AuthVault.findFirst({
        where(fields, operators) {
          return operators.and(
            operators.eq(fields.userId, userId),
            operators.eq(fields.tokenType, AuthManagerTokenTypeDict.Refresh)
          );
        },
      });
      if (!row) return null;

      // Check if token has expired
      if (isExpired(row.expiresAt)) {
        await this.delete(row.id);
        return null;
      }

      return {
        id: row.id,
        userId: row.userId,
        tokenType: row.tokenType as TAuthManagerTokenType,
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
        ackState: row.ackState || undefined,
        sessionState: row.sessionState || undefined,
      };
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
    ackState: string | null,
    expiresAt: Date,
    metadata?: Record<string, any>
  ): Promise<string> {
    try {
      const id = makeUUID();
      await this.db.insert(AuthVault).values({
        id,
        userId,
        tokenType: AuthManagerTokenTypeDict.Offline,
        encryptedToken: null,
        iv: null,
        expiresAt,
        metadata: metadata || null,
        status: OfflineTokenStatusDict.Pending,
        taskId,
        ackState,
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
    ackState: string,
    token: string | null,
    status: OfflineTokenStatus,
    sessionState?: string
  ): Promise<TokenVaultEntry | null> {
    try {
      const existing = await this.db
        .select()
        .from(AuthVault)
        .where(eq(AuthVault.ackState, ackState))
        .limit(1);

      if (existing.length === 0) {
        return null;
      }

      const row = existing[0];

      let encryptedToken: string | null = null;
      let iv: string | null = null;

      if (token) {
        iv = generateIV();
        encryptedToken = encryptToken(token, iv);
      }

      // Merge metadata: append new data to existing
      const existingMetadata = (row.metadata as Record<string, any>) || {};
      const mergedMetadata = {
        ...existingMetadata,
        tokenActivatedAt: new Date().toISOString(),
        status,
      };

      // Update the entry
      await this.db
        .update(AuthVault)
        .set({
          encryptedToken,
          iv,
          status,
          sessionState: sessionState || null,
          metadata: mergedMetadata,
        })
        .where(eq(AuthVault.id, row.id));

      return {
        id: row.id,
        userId: row.userId,
        tokenType: row.tokenType as TAuthManagerTokenType,
        encryptedToken: token,
        iv: iv || row.iv,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        metadata: row.metadata as Record<string, any> | undefined,
        status: status as any,
        taskId: row.taskId || undefined,
        ackState: row.ackState || undefined,
        sessionState: sessionState || row.sessionState || undefined,
      };
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: AuthManagerOperationDict.store,
        storageType: AuthManagerStorageTypeDict.postgres,
        originalError: error,
      });
    }
  }

  async getByAckState(ackState: string): Promise<TokenVaultEntry | null> {
    try {
      const result = await this.db
        .select()
        .from(AuthVault)
        .where(eq(AuthVault.ackState, ackState))
        .limit(1);

      if (result.length === 0) {
        return null;
      }

      const row = result[0];

      return {
        id: row.id,
        userId: row.userId,
        tokenType: row.tokenType as TAuthManagerTokenType,
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
        ackState: row.ackState || undefined,
        sessionState: row.sessionState || undefined,
      };
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: AuthManagerOperationDict.retrieve,
        storageType: AuthManagerStorageTypeDict.postgres,
        originalError: error,
      });
    }
  }

  async updateAckState(tokenId: string, ackState: string): Promise<void> {
    try {
      await this.db
        .update(AuthVault)
        .set({ ackState })
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

  async upsertRefreshToken(
    userId: string,
    token: string,
    expiresAt: Date,
    sessionState?: string,
    metadata?: Record<string, any>
  ): Promise<string> {
    try {
      const row = await this.db.query.AuthVault.findFirst({
        where: (f, op) => {
          return op.and(
            op.eq(f.userId, userId),
            op.eq(f.tokenType, AuthManagerTokenTypeDict.Refresh)
          );
        },
      });

      const iv = generateIV();
      const encryptedToken = encryptToken(token, iv);

      if (row) {
        const existingId = row.id;
        const existingMetadata = (row.metadata as Record<string, any>) || {};
        const mergedMetadata = metadata
          ? {
              ...existingMetadata,
              ...metadata,
              updatedAt: new Date().toISOString(),
            }
          : existingMetadata;

        await this.db
          .update(AuthVault)
          .set({
            encryptedToken,
            iv,
            expiresAt,
            sessionState: sessionState || null,
            metadata: mergedMetadata,
          })
          .where(eq(AuthVault.id, existingId));

        return existingId;
      } else {
        const id = makeUUID();
        await this.db.insert(AuthVault).values({
          id,
          userId,
          tokenType: AuthManagerTokenTypeDict.Refresh,
          encryptedToken,
          iv,
          expiresAt,
          sessionState: sessionState || null,
          metadata: metadata || null,
        });

        return id;
      }
    } catch (error) {
      console.log("–– – upsertRefreshToken – error––", error);
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: AuthManagerOperationDict.store,
        userId,
        storageType: AuthManagerStorageTypeDict.postgres,
        originalError: error,
      });
    }
  }
}
