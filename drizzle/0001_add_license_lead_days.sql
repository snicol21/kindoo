ALTER TABLE user ADD COLUMN license_lead_days integer NOT NULL DEFAULT 2;
UPDATE user SET license_lead_days = 2 WHERE license_lead_days IS NULL;
