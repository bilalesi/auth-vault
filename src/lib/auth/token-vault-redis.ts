import Redis from "ioredis";
import {
  AuthManagerTokenTypeDict,
  OfflineTokenStatusDict,
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
import { getTTLSeconds, isExpired } from "./date-utils";

/**
 * Redis Token Vault Entry (stored in Redis)
 */
interface RedisTokenEntry {
  id: string;
  userId: string;
  tokenType: TAuthManagerTokenType;
  encryptedToken: string | null;
  iv: string | null;
  createdAt: string; // ISO string
  expiresAt: string; // ISO string
  metadata?: Record<string, any>;
  status?: string;
  taskId?: string;
  ackState?: string;
  sessionState?: string;
}

/**
 * Redis singleton instance
 */
let redisInstance: Redis | null = null;

/**
 * Get or create Redis connection
 */
function getRedisClient(): Redis {
  if (redisInstance) {
    return redisInstance;
  }

  const host = process.env.REDIS_HOST || "localhost";
  const port = parseInt(process.env.REDIS_PORT || "6379", 10);
  const password = process.env.REDIS_PASSWORD;
  const tls = process.env.REDIS_TLS === "true";

  redisInstance = new Redis({
    host,
    port,
    password,
    tls: tls ? {} : undefined,
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    lazyConnect: false,
  });

  redisInstance.on("error", (error) => {
    console.error("Redis connection error:", error);
  });

  redisInstance.on("connect", () => {
    console.log("Redis connected successfully");
  });

  return redisInstance;
}

export class RedisStorage implements IStorage {
  private redis: Redis;

  constructor() {
    this.redis = getRedisClient();
  }

  private getTokenKey(tokenId: string): string {
    return `token:${tokenId}`;
  }

  private getUserTokensKey(userId: string): string {
    return `user:${userId}:tokens`;
  }

  private getAckStateKey(ackState: string): string {
    return `ackState:${ackState}`;
  }

  private getUserRefreshTokenKey(userId: string): string {
    return `user:${userId}:refresh`;
  }

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

      const entry: RedisTokenEntry = {
        id,
        userId,
        tokenType: type,
        encryptedToken,
        iv,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
        metadata,
      };

      const tokenKey = this.getTokenKey(id);
      const userTokensKey = this.getUserTokensKey(userId);
      const ttl = getTTLSeconds(expiresAt);
      await this.redis.setex(tokenKey, ttl, JSON.stringify(entry));
      await this.redis.sadd(userTokensKey, id);
      await this.redis.expire(userTokensKey, ttl);

      return id;
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: AuthManagerOperationDict.store,
        userId,
        persistentTokenId: tokenId,
        storageType: AuthManagerStorageTypeDict.redis,
        originalError: error,
      });
    }
  }

  async retrieve(tokenId: string): Promise<TokenVaultEntry | null> {
    try {
      const tokenKey = this.getTokenKey(tokenId);
      const data = await this.redis.get(tokenKey);

      if (!data) {
        return null;
      }

      const entry: RedisTokenEntry = JSON.parse(data);

      const expiresAt = new Date(entry.expiresAt);
      if (isExpired(expiresAt)) {
        await this.delete(tokenId);
        return null;
      }

      const decryptedToken =
        entry.encryptedToken && entry.iv
          ? decryptToken(entry.encryptedToken, entry.iv)
          : null;

      return {
        id: entry.id,
        userId: entry.userId,
        tokenType: entry.tokenType,
        encryptedToken: decryptedToken,
        iv: entry.iv,
        createdAt: new Date(entry.createdAt),
        expiresAt: new Date(entry.expiresAt),
        metadata: entry.metadata,
        status: entry.status as any,
        taskId: entry.taskId,
        ackState: entry.ackState,
        sessionState: entry.sessionState,
      };
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: AuthManagerOperationDict.retrieve,
        persistentTokenId: tokenId,
        storageType: AuthManagerStorageTypeDict.redis,
        originalError: error,
      });
    }
  }

  async delete(tokenId: string): Promise<void> {
    try {
      const tokenKey = this.getTokenKey(tokenId);
      const data = await this.redis.get(tokenKey);

      if (data) {
        const entry: RedisTokenEntry = JSON.parse(data);
        const userTokensKey = this.getUserTokensKey(entry.userId);

        // remove from user's token set
        await this.redis.srem(userTokensKey, tokenId);
      }

      await this.redis.del(tokenKey);
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: AuthManagerOperationDict.delete,
        persistentTokenId: tokenId,
        storageType: AuthManagerStorageTypeDict.redis,
        originalError: error,
      });
    }
  }

  async cleanup(): Promise<number> {
    // redis auto handles expiration with ttl
    // this method is a no-op for Redis but kept for interface compatibility
    console.log("Redis cleanup: TTL handles expiration automatically");
    return 0;
  }

  async getUserRefreshToken(userId: string): Promise<TokenVaultEntry | null> {
    try {
      const userRefreshKey = this.getUserRefreshTokenKey(userId);
      const tokenId = await this.redis.get(userRefreshKey);

      if (!tokenId) {
        return null;
      }

      const entry = await this.retrieve(tokenId);

      if (entry && entry.tokenType === AuthManagerTokenTypeDict.Refresh) {
        return entry;
      }

      return null;
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: AuthManagerOperationDict.get_user_tokens,
        userId,
        storageType: AuthManagerStorageTypeDict.redis,
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

      const entry: RedisTokenEntry = {
        id,
        userId,
        tokenType: AuthManagerTokenTypeDict.Offline,
        encryptedToken: null,
        iv: null,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
        metadata,
        status: OfflineTokenStatusDict.Pending,
        taskId,
        ackState: ackState || undefined,
      };

      const tokenKey = this.getTokenKey(id);
      const userTokensKey = this.getUserTokensKey(userId);
      const ackStateKey = ackState ? this.getAckStateKey(ackState) : null;

      const ttl = getTTLSeconds(expiresAt);

      await this.redis.setex(tokenKey, ttl, JSON.stringify(entry));

      // add token id to user's token set
      await this.redis.sadd(userTokensKey, id);
      await this.redis.expire(userTokensKey, ttl);

      // create ack state index pointing to token id
      if (ackStateKey) {
        await this.redis.setex(ackStateKey, ttl, id);
      }

      return id;
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: AuthManagerOperationDict.store,
        userId,
        storageType: AuthManagerStorageTypeDict.redis,
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
      // Find token ID by ack state
      const ackStateKey = this.getAckStateKey(ackState);
      const tokenId = await this.redis.get(ackStateKey);

      if (!tokenId) {
        return null;
      }

      // Get existing entry
      const tokenKey = this.getTokenKey(tokenId);
      const data = await this.redis.get(tokenKey);

      if (!data) {
        return null;
      }

      const entry: RedisTokenEntry = JSON.parse(data);

      // Encrypt token if provided
      let encryptedToken: string | null = null;
      let iv: string | null = null;

      if (token) {
        iv = generateIV();
        encryptedToken = encryptToken(token, iv);
      }

      // Merge metadata: append new data to existing
      const existingMetadata = entry.metadata || {};
      const mergedMetadata = {
        ...existingMetadata,
        tokenActivatedAt: new Date().toISOString(),
        status,
      };

      // Update entry
      const updatedEntry: RedisTokenEntry = {
        ...entry,
        encryptedToken,
        iv,
        status,
        sessionState: sessionState || entry.sessionState,
        metadata: mergedMetadata,
      };

      // Calculate remaining TTL
      const ttl = getTTLSeconds(new Date(entry.expiresAt));

      // Store updated entry
      await this.redis.setex(tokenKey, ttl, JSON.stringify(updatedEntry));

      return {
        id: updatedEntry.id,
        userId: updatedEntry.userId,
        tokenType: updatedEntry.tokenType,
        encryptedToken: token,
        iv: iv || entry.iv,
        createdAt: new Date(updatedEntry.createdAt),
        expiresAt: new Date(updatedEntry.expiresAt),
        metadata: updatedEntry.metadata,
        status: status as any,
        taskId: updatedEntry.taskId,
        ackState: updatedEntry.ackState,
        sessionState: sessionState || entry.sessionState,
      };
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: AuthManagerOperationDict.store,
        storageType: AuthManagerStorageTypeDict.redis,
        originalError: error,
      });
    }
  }

  async getByAckState(ackState: string): Promise<TokenVaultEntry | null> {
    try {
      const ackStateKey = this.getAckStateKey(ackState);
      const tokenId = await this.redis.get(ackStateKey);

      if (!tokenId) {
        return null;
      }

      return await this.retrieve(tokenId);
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: AuthManagerOperationDict.retrieve,
        storageType: AuthManagerStorageTypeDict.redis,
        originalError: error,
      });
    }
  }

  async updateAckState(tokenId: string, ackState: string): Promise<void> {
    try {
      const tokenKey = this.getTokenKey(tokenId);
      const data = await this.redis.get(tokenKey);

      if (!data) {
        throw new AuthManagerError(AuthManagerErrorDict.token_not_found.code, {
          persistentTokenId: tokenId,
        });
      }

      const entry: RedisTokenEntry = JSON.parse(data);

      const updatedEntry: RedisTokenEntry = {
        ...entry,
        ackState,
      };

      const ttl = getTTLSeconds(new Date(entry.expiresAt));

      await this.redis.setex(tokenKey, ttl, JSON.stringify(updatedEntry));

      const ackStateKey = this.getAckStateKey(ackState);
      await this.redis.setex(ackStateKey, ttl, tokenId);
    } catch (error) {
      if (AuthManagerError.is(error)) {
        throw error;
      }
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: AuthManagerOperationDict.store,
        persistentTokenId: tokenId,
        storageType: AuthManagerStorageTypeDict.redis,
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
      const userRefreshKey = this.getUserRefreshTokenKey(userId);
      const existingTokenId = await this.redis.get(userRefreshKey);

      if (existingTokenId) {
        const iv = generateIV();
        const encryptedToken = encryptToken(token, iv);

        const tokenKey = this.getTokenKey(existingTokenId);
        const data = await this.redis.get(tokenKey);

        if (data) {
          const entry: RedisTokenEntry = JSON.parse(data);

          const existingMetadata = entry.metadata || {};
          const mergedMetadata = metadata
            ? {
                ...existingMetadata,
                ...metadata,
                updatedAt: new Date().toISOString(),
              }
            : existingMetadata;

          const updatedEntry: RedisTokenEntry = {
            ...entry,
            encryptedToken,
            iv,
            expiresAt: expiresAt.toISOString(),
            sessionState: sessionState || entry.sessionState,
            metadata: mergedMetadata,
          };

          const ttl = getTTLSeconds(expiresAt);
          await this.redis.setex(tokenKey, ttl, JSON.stringify(updatedEntry));
          await this.redis.setex(userRefreshKey, ttl, existingTokenId);

          console.log("Refresh token updated for user:", userId);
          return existingTokenId;
        }
      }

      const id = makeUUID();
      const iv = generateIV();
      const encryptedToken = encryptToken(token, iv);

      const entry: RedisTokenEntry = {
        id,
        userId,
        tokenType: AuthManagerTokenTypeDict.Refresh,
        encryptedToken,
        iv,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
        metadata,
        sessionState,
      };

      const tokenKey = this.getTokenKey(id);
      const userTokensKey = this.getUserTokensKey(userId);

      const ttl = getTTLSeconds(expiresAt);

      await this.redis.setex(tokenKey, ttl, JSON.stringify(entry));
      await this.redis.sadd(userTokensKey, id);
      await this.redis.expire(userTokensKey, ttl);
      await this.redis.setex(userRefreshKey, ttl, id);

      console.log("Refresh token created for user:", userId);
      return id;
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: AuthManagerOperationDict.store,
        userId,
        storageType: AuthManagerStorageTypeDict.redis,
        originalError: error,
      });
    }
  }
}
