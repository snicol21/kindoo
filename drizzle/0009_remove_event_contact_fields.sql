-- Normalize existing contact identifiers before rebuilding events.
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

-- Normalize legacy event identifiers before matching.
UPDATE event
SET email = NULL
WHERE email IS NOT NULL AND trim(email) = '';

UPDATE event
SET phone = NULL
WHERE phone IS NOT NULL AND trim(phone) = '';

-- Ensure every event has a contact.
INSERT INTO contact (id, name, ward, email, phone, created_at)
SELECT
  (
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-' ||
    '4' || substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6)))
  ) AS id,
  e.name,
  e.ward,
  NULLIF(lower(trim(e.email)), ''),
  NULLIF(trim(e.phone), ''),
  unixepoch()
FROM event e
WHERE e.contactId IS NULL
  AND (e.email IS NOT NULL OR e.phone IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1
    FROM contact c
    WHERE c.ward = e.ward
      AND (
        (e.email IS NOT NULL AND c.email = lower(trim(e.email))) OR
        (e.phone IS NOT NULL AND c.phone = trim(e.phone))
      )
  );

UPDATE event
SET contactId = (
  SELECT c.id
  FROM contact c
  WHERE c.ward = event.ward
    AND (
      (event.email IS NOT NULL AND c.email = lower(trim(event.email))) OR
      (event.phone IS NOT NULL AND c.phone = trim(event.phone))
    )
  LIMIT 1
)
WHERE contactId IS NULL;

UPDATE event
SET contactId = (
  SELECT c.id
  FROM contact c
  WHERE c.ward = event.ward
    AND (
      (event.email IS NOT NULL AND c.email = lower(trim(event.email))) OR
      (event.phone IS NOT NULL AND c.phone = trim(event.phone))
    )
  LIMIT 1
)
WHERE contactId IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM contact c WHERE c.id = event.contactId
  );

-- Final safety net for legacy rows with no identifiers: create a deterministic placeholder contact per event.
INSERT INTO contact (id, name, ward, email, phone, created_at)
SELECT
  (
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-' ||
    '4' || substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6)))
  ) AS id,
  e.name,
  e.ward,
  lower('legacy-' || e.id || '@unknown.local'),
  NULL,
  unixepoch()
FROM event e
WHERE e.contactId IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM contact c
    WHERE c.ward = e.ward
      AND c.email = lower('legacy-' || e.id || '@unknown.local')
  );

UPDATE event
SET contactId = (
  SELECT c.id
  FROM contact c
  WHERE c.ward = event.ward
    AND c.email = lower('legacy-' || event.id || '@unknown.local')
  LIMIT 1
)
WHERE contactId IS NULL;

-- Rebuild the events table without duplicate contact fields.
CREATE TABLE event_new (
  id TEXT PRIMARY KEY NOT NULL,
  building TEXT NOT NULL,
  event_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  contactId TEXT NOT NULL REFERENCES contact(id) ON DELETE RESTRICT,
  description TEXT NOT NULL,
  kindoo_license_created INTEGER NOT NULL DEFAULT 0,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO event_new (
  id,
  building,
  event_date,
  start_time,
  end_time,
  contactId,
  description,
  kindoo_license_created,
  userId,
  created_at
)
SELECT
  id,
  building,
  event_date,
  start_time,
  end_time,
  contactId,
  description,
  kindoo_license_created,
  userId,
  created_at
FROM event;

DROP TABLE event;
ALTER TABLE event_new RENAME TO event;
