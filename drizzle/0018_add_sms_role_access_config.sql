CREATE TABLE `sms_role_access_config` (
  `id` text PRIMARY KEY NOT NULL,
  `admin_enabled` integer DEFAULT true NOT NULL,
  `stake_manager_enabled` integer DEFAULT false NOT NULL,
  `ward_manager_enabled` integer DEFAULT false NOT NULL,
  `ward_user_enabled` integer DEFAULT false NOT NULL,
  `updated_by_user_id` text,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`updated_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);

INSERT INTO `sms_role_access_config` (
  `id`,
  `admin_enabled`,
  `stake_manager_enabled`,
  `ward_manager_enabled`,
  `ward_user_enabled`
) VALUES (
  'default',
  true,
  false,
  false,
  false
);