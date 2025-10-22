CREATE TYPE "public"."auth_token_status" AS ENUM('pending', 'active', 'failed', 'undefined');--> statement-breakpoint
CREATE TYPE "public"."auth_token_type" AS ENUM('offline', 'refresh');--> statement-breakpoint
CREATE TABLE "auth_vault" (
	"id" uuid PRIMARY KEY DEFAULT 'dd5c6001-003e-4c7e-9171-653954fa33ff' NOT NULL,
	"user_id" uuid NOT NULL,
	"token_type" "auth_token_type" NOT NULL,
	"encrypted_token" text,
	"iv" text,
	"token_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"metadata" jsonb,
	"status" "auth_token_status",
	"task_id" text,
	"ack_state" text,
	"session_state" text
);
--> statement-breakpoint
CREATE INDEX "auth_vault_user_id_token_type_idx" ON "auth_vault" USING btree ("user_id","token_type" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "auth_vault_expires_at_idx" ON "auth_vault" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "auth_vault_task_id_idx" ON "auth_vault" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "auth_vault_ack_state_idx" ON "auth_vault" USING btree ("ack_state");--> statement-breakpoint
CREATE INDEX "auth_vault_session_state_idx" ON "auth_vault" USING btree ("session_state");--> statement-breakpoint
CREATE INDEX "auth_vault_token_hash_idx" ON "auth_vault" USING btree ("token_hash");