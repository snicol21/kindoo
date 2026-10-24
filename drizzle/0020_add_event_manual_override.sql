-- "Mark as handled manually" admin override. Additive and nullable only: four columns on
-- event (the overlay), an append-only history table, and one column on license_worker_heartbeat
-- (the interval the worker reports). Existing rows are untouched.
ALTER TABLE `event` ADD `manual_handled_at` integer;
--> statement-breakpoint
ALTER TABLE `event` ADD `manual_handled_by_user_id` text REFERENCES `user`(`id`) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `event` ADD `manual_reason` text;
--> statement-breakpoint
ALTER TABLE `event` ADD `manual_note` text;
--> statement-breakpoint
CREATE TABLE `event_manual_override_log` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`action` text NOT NULL,
	`actor_user_id` text,
	`actor_name` text,
	`reason` text,
	`note` text,
	`details` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `event_manual_override_log_event_created_idx` ON `event_manual_override_log` (`event_id`, `created_at`);
--> statement-breakpoint
ALTER TABLE `license_worker_heartbeat` ADD `interval_ms` integer;
