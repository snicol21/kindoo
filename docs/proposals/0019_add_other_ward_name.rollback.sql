-- Rollback for 0019. Run only after reassigning or deleting any ward = 'Other' contacts,
-- otherwise the original (ward, email) unique index may fail to rebuild.
DROP INDEX IF EXISTS `contact_email_unique`;
--> statement-breakpoint
DROP INDEX IF EXISTS `contact_phone_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `contact_email_unique` ON `contact` (`ward`, `email`);
--> statement-breakpoint
CREATE UNIQUE INDEX `contact_phone_unique` ON `contact` (`ward`, `phone`);
--> statement-breakpoint
ALTER TABLE `contact` DROP COLUMN `other_ward_name`;
