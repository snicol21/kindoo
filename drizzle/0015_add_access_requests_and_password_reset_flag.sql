ALTER TABLE `user` ADD `must_change_password` integer DEFAULT false NOT NULL;

CREATE TABLE `access_request` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL,
  `name` text NOT NULL,
  `phone` text NOT NULL,
  `ward` text NOT NULL,
  `comments` text,
  `requested_role` text,
  `status` text DEFAULT 'pending' NOT NULL,
  `reviewed_at` integer,
  `reviewed_by_user_id` text,
  `review_note` text,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE INDEX `access_request_status_created_idx` ON `access_request` (`status`,`created_at`);
CREATE INDEX `access_request_email_status_idx` ON `access_request` (`email`,`status`);
