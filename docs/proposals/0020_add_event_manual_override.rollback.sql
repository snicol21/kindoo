-- Rollback for 0020. Drops the override history and the four overlay columns.
-- Any event currently marked as handled manually goes back to normal automation handling,
-- so reopen those events (or accept that the worker may queue them) before running this.
DROP INDEX IF EXISTS `event_manual_override_log_event_created_idx`;
--> statement-breakpoint
DROP TABLE IF EXISTS `event_manual_override_log`;
--> statement-breakpoint
ALTER TABLE `event` DROP COLUMN `manual_note`;
--> statement-breakpoint
ALTER TABLE `event` DROP COLUMN `manual_reason`;
--> statement-breakpoint
ALTER TABLE `event` DROP COLUMN `manual_handled_by_user_id`;
--> statement-breakpoint
ALTER TABLE `event` DROP COLUMN `manual_handled_at`;
