-- Sycamores 8th Ward and "Other" ward support.
-- ward columns are plain TEXT (enum is enforced in app code only), so the two new ward
-- values need no DDL. This migration adds the free-text name for "Other" contacts and
-- makes the per-ward contact uniqueness include it, so two different "Other" units can
-- each have a contact with the same email or phone.
ALTER TABLE `contact` ADD `other_ward_name` text;
--> statement-breakpoint
DROP INDEX IF EXISTS `contact_email_unique`;
--> statement-breakpoint
DROP INDEX IF EXISTS `contact_phone_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `contact_email_unique` ON `contact` (`ward`, coalesce(`other_ward_name`, ''), `email`);
--> statement-breakpoint
CREATE UNIQUE INDEX `contact_phone_unique` ON `contact` (`ward`, coalesce(`other_ward_name`, ''), `phone`);
