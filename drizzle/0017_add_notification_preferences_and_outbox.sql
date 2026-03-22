CREATE TABLE `notification_preference` (
  `user_id` text PRIMARY KEY NOT NULL,
  `sms_enabled` integer DEFAULT false NOT NULL,
  `sms_phone` text,
  `access_request_submitted_sms` integer DEFAULT true NOT NULL,
  `license_job_completed_sms` integer DEFAULT true NOT NULL,
  `license_job_failed_sms` integer DEFAULT true NOT NULL,
  `event_created_sms` integer DEFAULT false NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `notification_outbox` (
  `id` text PRIMARY KEY NOT NULL,
  `event_key` text NOT NULL,
  `recipient_user_id` text NOT NULL,
  `phone_e164` text NOT NULL,
  `message` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `attempts` integer DEFAULT 0 NOT NULL,
  `provider_message_id` text,
  `provider_error` text,
  `sent_at` integer,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`recipient_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `notification_outbox_recipient_status_idx` ON `notification_outbox` (`recipient_user_id`,`status`,`created_at`);
CREATE INDEX `notification_outbox_event_status_idx` ON `notification_outbox` (`event_key`,`status`);
