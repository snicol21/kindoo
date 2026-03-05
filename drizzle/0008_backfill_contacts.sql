WITH distinct_events AS (
  SELECT DISTINCT
    name,
    ward,
    email,
    phone
  FROM event
)
INSERT INTO contact (id, name, ward, email, phone, created_at)
SELECT
  (
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-' ||
    '4' || substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6)))
  ) AS id,
  de.name,
  de.ward,
  de.email,
  de.phone,
  unixepoch()
FROM distinct_events de
WHERE NOT EXISTS (
  SELECT 1
  FROM contact c
  WHERE c.name = de.name
    AND c.ward = de.ward
    AND COALESCE(c.email, '') = COALESCE(de.email, '')
    AND COALESCE(c.phone, '') = COALESCE(de.phone, '')
);

UPDATE event
SET contactId = (
  SELECT c.id
  FROM contact c
  WHERE c.name = event.name
    AND c.ward = event.ward
    AND COALESCE(c.email, '') = COALESCE(event.email, '')
    AND COALESCE(c.phone, '') = COALESCE(event.phone, '')
  LIMIT 1
)
WHERE contactId IS NULL;

UPDATE contact
SET email = NULL
WHERE email IS NOT NULL AND trim(email) = '';

UPDATE contact
SET phone = NULL
WHERE phone IS NOT NULL AND trim(phone) = '';

UPDATE contact
SET email = lower(trim(email))
WHERE email IS NOT NULL;

UPDATE contact
SET phone = trim(phone)
WHERE phone IS NOT NULL;

-- Merge duplicate contacts by owner + email (keep lowest rowid)
WITH email_dupes AS (
  SELECT c1.id AS keep_id, c2.id AS drop_id
  FROM contact c1
  JOIN contact c2
    ON c1.rowid < c2.rowid
   AND c1.ward = c2.ward
   AND c1.email IS NOT NULL
   AND c2.email IS NOT NULL
   AND lower(c1.email) = lower(c2.email)
)
UPDATE event
SET contactId = (
  SELECT keep_id
  FROM email_dupes
  WHERE drop_id = event.contactId
  LIMIT 1
)
WHERE contactId IN (SELECT drop_id FROM email_dupes);

WITH email_dupes AS (
  SELECT c1.id AS keep_id, c2.id AS drop_id
  FROM contact c1
  JOIN contact c2
    ON c1.rowid < c2.rowid
   AND c1.ward = c2.ward
   AND c1.email IS NOT NULL
   AND c2.email IS NOT NULL
   AND lower(c1.email) = lower(c2.email)
)
DELETE FROM contact
WHERE id IN (SELECT drop_id FROM email_dupes);

-- Merge duplicate contacts by owner + phone (keep lowest rowid)
WITH phone_dupes AS (
  SELECT c1.id AS keep_id, c2.id AS drop_id
  FROM contact c1
  JOIN contact c2
    ON c1.rowid < c2.rowid
   AND c1.ward = c2.ward
   AND c1.phone IS NOT NULL
   AND c2.phone IS NOT NULL
   AND c1.phone = c2.phone
)
UPDATE event
SET contactId = (
  SELECT keep_id
  FROM phone_dupes
  WHERE drop_id = event.contactId
  LIMIT 1
)
WHERE contactId IN (SELECT drop_id FROM phone_dupes);

WITH phone_dupes AS (
  SELECT c1.id AS keep_id, c2.id AS drop_id
  FROM contact c1
  JOIN contact c2
    ON c1.rowid < c2.rowid
   AND c1.ward = c2.ward
   AND c1.phone IS NOT NULL
   AND c2.phone IS NOT NULL
   AND c1.phone = c2.phone
)
DELETE FROM contact
WHERE id IN (SELECT drop_id FROM phone_dupes);

-- Remove contacts that still have no usable identifier and unlink events.
UPDATE event
SET contactId = NULL
WHERE contactId IN (
  SELECT id
  FROM contact
  WHERE email IS NULL AND phone IS NULL
);

DELETE FROM contact
WHERE email IS NULL AND phone IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS contact_email_unique
  ON contact(ward, email);

CREATE UNIQUE INDEX IF NOT EXISTS contact_phone_unique
  ON contact(ward, phone);

CREATE TRIGGER IF NOT EXISTS contact_identifier_insert_check
BEFORE INSERT ON contact
FOR EACH ROW
WHEN (
  (NEW.email IS NULL OR trim(NEW.email) = '') AND
  (NEW.phone IS NULL OR trim(NEW.phone) = '')
)
BEGIN
  SELECT RAISE(ABORT, 'At least one contact method is required (email or phone).');
END;

CREATE TRIGGER IF NOT EXISTS contact_identifier_update_check
BEFORE UPDATE ON contact
FOR EACH ROW
WHEN (
  (NEW.email IS NULL OR trim(NEW.email) = '') AND
  (NEW.phone IS NULL OR trim(NEW.phone) = '')
)
BEGIN
  SELECT RAISE(ABORT, 'At least one contact method is required (email or phone).');
END;
