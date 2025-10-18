ALTER TABLE "auth_vault" RENAME COLUMN "tokenType" TO "token_type";--> statement-breakpoint
DROP INDEX "auth_vault_user_id_token_type_idx";--> statement-breakpoint
ALTER TABLE "auth_vault" ALTER COLUMN "id" SET DEFAULT 'bfc40deb-e532-4360-a7f4-3c319ca86a48';--> statement-breakpoint
CREATE INDEX "auth_vault_user_id_token_type_idx" ON "auth_vault" USING btree ("user_id","token_type" DESC NULLS LAST);