import Redis from "ioredis";
import {
  AuthManagerTokenTypeDict,
  OfflineTokenStatusDict,
  type IStorage,
  type AuthManagerVaultEntry,
  type TAuthManagerTokenType,
  type OfflineTokenStatus,
} from "./token-vault-interface";
import {
  encryptToken,
  decryptToken,
  generateIV,
  hashToken,
} from "./encryption";
import { makeUUID } from "./uuid";
import {
  AuthManagerError,
  AuthManagerErrorDict,
  AuthManagerStorageTypeDict,
} from "./vault-errors";
import { getTTLSeconds, isExpired } from "./date-utils";
import { logger, AuthLogEventDict } from "@/lib/logger";

interface RedisTokenEntry {
  id: string;
  userId: string;
  tokenType: TAuthManagerTokenType;
  encryptedToken: string | null;
  iv: string | null;
  tokenHash?: string | null;
  createdAt: string; // ISO string
  expiresAt: string; // ISO string
  metadata?: Record<string, any>;
  status?: string;
  taskId?: string;
  ackState?: string;
  sessionState?: string;
}

let redisInstance: Redis | null = null;

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
    logger.storage(
      AuthLogEventDict.vaultError,
      {
        component: "AuthManagerRedisStorage",
        operation: "connect",
        storageType: AuthManagerStorageTypeDict.redis,
      },
      error
    );
  });

  redisInstance.on("connect", () => {
    logger.storage(AuthLogEventDict.vaultStore, {
      component: "AuthManagerRedisStorage",
      operation: "connect",
      storageType: AuthManagerStorageTypeDict.redis,
    });
  });

  return redisInstance;
}

export class AuthManagerRedisStorage implements IStorage {
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
      const tokenHash =
        type === AuthManagerTokenTypeDict.Offline ? hashToken(token) : null;

      const entry: RedisTokenEntry = {
        id,
        userId,
        tokenType: type,
        encryptedToken,
        iv,
        tokenHash,
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
        operation: "create",
        userId,
        persistentTokenId: tokenId,
        storageType: AuthManagerStorageTypeDict.redis,
        originalError: error,
      });
    }
  }

  async retrieve(tokenId: string): Promise<AuthManagerVaultEntry | null> {
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
        operation: "retrieve",
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
        operation: "delete",
        persistentTokenId: tokenId,
        storageType: AuthManagerStorageTypeDict.redis,
        originalError: error,
      });
    }
  }

  async cleanup(): Promise<number> {
    // redis auto handles expiration with ttl
    // this method is a no-op for Redis but kept for interface compatibility
    logger.storage(AuthLogEventDict.vaultDelete, {
      component: "AuthManagerRedisStorage",
      operation: "cleanup",
      storageType: AuthManagerStorageTypeDict.redis,
    });
    return 0;
  }

  async getUserRefreshToken(
    userId: string
  ): Promise<AuthManagerVaultEntry | null> {
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
        operation: "get_user_refresh_token",
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

      await this.redis.sadd(userTokensKey, id);
      await this.redis.expire(userTokensKey, ttl);

      if (ackStateKey) {
        await this.redis.setex(ackStateKey, ttl, id);
      }

      return id;
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: "makePendingOfflineToken",
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
  ): Promise<AuthManagerVaultEntry | null> {
    try {
      const ackStateKey = this.getAckStateKey(ackState);
      const tokenId = await this.redis.get(ackStateKey);

      if (!tokenId) {
        return null;
      }

      const tokenKey = this.getTokenKey(tokenId);
      const data = await this.redis.get(tokenKey);

      if (!data) {
        return null;
      }

      const entry: RedisTokenEntry = JSON.parse(data);

      let encryptedToken: string | null = null;
      let iv: string | null = null;
      let tokenHash: string | null = null;

      if (token) {
        iv = generateIV();
        encryptedToken = encryptToken(token, iv);
        tokenHash = hashToken(token);
      }

      const existingMetadata = entry.metadata || {};
      const mergedMetadata = {
        ...existingMetadata,
        tokenActivatedAt: new Date().toISOString(),
        status,
      };

      const updatedEntry: RedisTokenEntry = {
        ...entry,
        encryptedToken,
        iv,
        tokenHash,
        status,
        sessionState: sessionState || entry.sessionState,
        metadata: mergedMetadata,
      };

      const ttl = getTTLSeconds(new Date(entry.expiresAt));

      await this.redis.setex(tokenKey, ttl, JSON.stringify(updatedEntry));

      return {
        id: updatedEntry.id,
        userId: updatedEntry.userId,
        tokenType: updatedEntry.tokenType,
        encryptedToken: encryptedToken || entry.encryptedToken,
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
        operation: "updateOfflineTokenByState",
        storageType: AuthManagerStorageTypeDict.redis,
        originalError: error,
      });
    }
  }

  async retrieveByAckState(
    ackState: string
  ): Promise<AuthManagerVaultEntry | null> {
    try {
      const ackStateKey = this.getAckStateKey(ackState);
      const tokenId = await this.redis.get(ackStateKey);

      if (!tokenId) {
        return null;
      }

      return await this.retrieve(tokenId);
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: "retrieveByAckState",
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
        operation: "updateAckState",
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

          logger.storage(AuthLogEventDict.tokenRefreshed, {
            component: "AuthManagerRedisStorage",
            operation: "upsertRefreshToken",
            userId,
            persistentTokenId: existingTokenId,
          });
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

      logger.storage(AuthLogEventDict.tokenCreated, {
        component: "AuthManagerRedisStorage",
        operation: "upsertRefreshToken",
        userId,
        persistentTokenId: id,
        tokenType: AuthManagerTokenTypeDict.Refresh,
      });
      return id;
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: "upsertRefreshToken",
        userId,
        storageType: AuthManagerStorageTypeDict.redis,
        originalError: error,
      });
    }
  }

  async retrieveUserOfflineTokens(
    userId: string
  ): Promise<AuthManagerVaultEntry[]> {
    try {
      const userTokensKey = this.getUserTokensKey(userId);
      const tokenIds = await this.redis.smembers(userTokensKey);

      if (!tokenIds || tokenIds.length === 0) {
        return [];
      }

      const entries: AuthManagerVaultEntry[] = [];

      for (const tokenId of tokenIds) {
        const tokenKey = this.getTokenKey(tokenId);
        const data = await this.redis.get(tokenKey);

        if (data) {
          const entry: RedisTokenEntry = JSON.parse(data);

          if (entry.tokenType === AuthManagerTokenTypeDict.Offline) {
            entries.push({
              id: entry.id,
              userId: entry.userId,
              tokenType: entry.tokenType as TAuthManagerTokenType,
              encryptedToken: entry.encryptedToken,
              iv: entry.iv,
              createdAt: new Date(entry.createdAt),
              expiresAt: new Date(entry.expiresAt),
              metadata: entry.metadata,
              status: entry.status as OfflineTokenStatus | undefined,
              taskId: entry.taskId,
              ackState: entry.ackState,
              sessionState: entry.sessionState,
            });
          }
        }
      }

      entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return entries;
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: "retrieveUserOfflineTokens",
        userId,
        storageType: AuthManagerStorageTypeDict.redis,
        originalError: error,
      });
    }
  }

  // TODO: find better way
  async retrieveDuplicateTokenHash(
    tokenHash: string,
    excludeTokenId: string
  ): Promise<boolean> {
    try {
      // in redis, we need to scan all tokens to find matching hash
      // This is less efficient than Postgres but necessary for Redis
      const pattern = this.getTokenKey("*");
      const keys = await this.redis.keys(pattern);

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const entry: RedisTokenEntry = JSON.parse(data);
          if (entry.tokenHash === tokenHash && entry.id !== excludeTokenId) {
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: "retrieveDuplicateTokenHash",
        tokenHash,
        excludeTokenId,
        storageType: AuthManagerStorageTypeDict.redis,
        originalError: error,
      });
    }
  }

  async retrieveBySessionState(
    sessionState: string,
    excludeTokenId: string
  ): Promise<AuthManagerVaultEntry[]> {
    try {
      // Redis doesn't have a direct way to query by sessionState
      // We need to scan all tokens (not ideal for large datasets)
      const pattern = this.getTokenKey("*");
      const keys = await this.redis.keys(pattern);

      const entries: AuthManagerVaultEntry[] = [];

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const entry: RedisTokenEntry = JSON.parse(data);
          // Match sessionState and exclude the specified token ID
          if (
            entry.sessionState === sessionState &&
            entry.id !== excludeTokenId
          ) {
            entries.push({
              id: entry.id,
              userId: entry.userId,
              tokenType: entry.tokenType as TAuthManagerTokenType,
              encryptedToken: entry.encryptedToken,
              iv: entry.iv,
              tokenHash: entry.tokenHash,
              createdAt: new Date(entry.createdAt),
              expiresAt: new Date(entry.expiresAt),
              metadata: entry.metadata,
              status: entry.status as OfflineTokenStatus | undefined,
              taskId: entry.taskId,
              ackState: entry.ackState,
              sessionState: entry.sessionState,
            });
          }
        }
      }

      // Sort by creation date (newest first)
      entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return entries;
    } catch (error) {
      throw new AuthManagerError(AuthManagerErrorDict.storage_error.code, {
        operation: "retrieveBySessionState",
        sessionState,
        excludeTokenId,
        storageType: AuthManagerStorageTypeDict.redis,
        originalError: error,
      });
    }
  }
}
