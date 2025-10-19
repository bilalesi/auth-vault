import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  index,
  pgEnum,
  unique,
} from "drizzle-orm/pg-core";
import { makeUUID } from "../auth/uuid";

export const TokenStatusEnum = pgEnum("auth_token_status", [
  "pending",
  "active",
  "failed",
  "undefined",
]);

export const TokenStatusValues = TokenStatusEnum.enumValues;
export type TTokenStatusValues = (typeof TokenStatusValues)[number];

export const TokenTypeEnum = pgEnum("auth_token_type", ["offline", "refresh"]);
export const TokenTypeEnumValues = TokenTypeEnum.enumValues;
export type TTokenTypeEnumValues = (typeof TokenTypeEnumValues)[number];

export const AuthVault = pgTable(
  "auth_vault",
  {
    id: uuid("id").primaryKey().default(makeUUID()),
    userId: uuid("user_id").notNull(),
    tokenType: TokenTypeEnum("token_type").notNull(),
    encryptedToken: text("encrypted_token"),
    iv: text("iv"),
    tokenHash: text("token_hash"), // SHA-256 hash of the decrypted token for deduplication
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
    metadata: jsonb("metadata"),
    status: TokenStatusEnum(),
    taskId: text("task_id"),
    ackState: text("ack_state"),
    sessionState: text("session_state"),
  },
  (t) => [
    index("auth_vault_user_id_token_type_idx").on(t.userId, t.tokenType.desc()),
    index("auth_vault_expires_at_idx").on(t.expiresAt),
    index("auth_vault_task_id_idx").on(t.taskId),
    index("auth_vault_ack_state_idx").on(t.ackState),
    index("auth_vault_session_state_idx").on(t.sessionState),
    index("auth_vault_token_hash_idx").on(t.tokenHash),
  ]
);

export type TokenVaultRow = typeof AuthVault.$inferSelect;
export type TokenVaultInsert = typeof AuthVault.$inferInsert;
