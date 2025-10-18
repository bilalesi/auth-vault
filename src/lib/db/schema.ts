import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { generatePersistentTokenId } from "../auth/uuid";

export const TokenStatusEnum = pgEnum("auth_token_status", [
  "pending",
  "active",
  "failed",
  "none",
]);

export const TokenStatusValues = TokenStatusEnum.enumValues;
export type TTokenStatusValues = (typeof TokenStatusValues)[number];

export const TokenTypeEnum = pgEnum("auth_token_type", ["offline", "refresh"]);
export const TokenTypeEnumValues = TokenTypeEnum.enumValues;
export type TTokenTypeEnumValues = (typeof TokenTypeEnumValues)[number];

export const AuthVault = pgTable(
  "auth_vault",
  {
    id: uuid("id").primaryKey().default(generatePersistentTokenId()),
    userId: uuid("user_id").notNull(), // UUID from Keycloak
    tokenType: TokenTypeEnum().notNull(),
    encryptedToken: text("encrypted_token"), // Nullable for pending offline tokens
    iv: text("iv"), // Nullable for pending offline tokens
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
    metadata: jsonb("metadata"),
    status: TokenStatusEnum().default("none"),
    taskId: text("task_id"),
    stateToken: text("state_token"),
  },
  (table) => [
    index("auth_vault_user_id_idx").on(table.userId),
    index("auth_vault_expires_at_idx").on(table.expiresAt),
    index("auth_vault_task_id_idx").on(table.taskId),
    index("auth_vault_state_token_idx").on(table.stateToken),
  ]
);

export type TokenVaultRow = typeof AuthVault.$inferSelect;
export type TokenVaultInsert = typeof AuthVault.$inferInsert;
