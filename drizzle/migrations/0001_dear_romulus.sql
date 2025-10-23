DROP INDEX "auth_vault_expires_at_idx";--> statement-breakpoint
DROP INDEX "auth_vault_task_id_idx";--> statement-breakpoint
DROP INDEX "auth_vault_ack_state_idx";--> statement-breakpoint
DROP INDEX "auth_vault_session_state_idx";--> statement-breakpoint
ALTER TABLE "auth_vault" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "auth_vault" ADD COLUMN "session_state_id" text NOT NULL;--> statement-breakpoint
CREATE INDEX "auth_vault_session_state_idx" ON "auth_vault" USING btree ("session_state_id");--> statement-breakpoint
ALTER TABLE "auth_vault" DROP COLUMN "expires_at";--> statement-breakpoint
ALTER TABLE "auth_vault" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "auth_vault" DROP COLUMN "task_id";--> statement-breakpoint
ALTER TABLE "auth_vault" DROP COLUMN "ack_state";--> statement-breakpoint
ALTER TABLE "auth_vault" DROP COLUMN "session_state";