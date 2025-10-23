import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";

import { makeUUID } from "@/services/auth-manager/auth/uuid";

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
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    tokenType: TokenTypeEnum("token_type").notNull(),
    encryptedToken: text("encrypted_token"),
    iv: text("iv"),
    tokenHash: text("token_hash"), // SHA-256 hash of the decrypted token for deduplication
    metadata: jsonb("metadata").$type<Record<string, any>>(),
    sessionStateId: text("session_state_id").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("auth_vault_user_id_token_type_idx").on(t.userId, t.tokenType.desc()),
    index("auth_vault_session_state_idx").on(t.sessionStateId),
    index("auth_vault_token_hash_idx").on(t.tokenHash),
  ]
);

export type TAuthManagerTokenVaultRow = typeof AuthVault.$inferSelect;
export type TAuthManagerTokenVaultInsert = typeof AuthVault.$inferInsert;
