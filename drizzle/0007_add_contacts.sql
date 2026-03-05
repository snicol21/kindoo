CREATE TABLE contact (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  ward TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX contact_name_idx ON contact(name);
CREATE INDEX contact_ward_idx ON contact(ward);
CREATE INDEX contact_email_idx ON contact(email);
CREATE INDEX contact_phone_idx ON contact(phone);

ALTER TABLE event ADD COLUMN contactId TEXT REFERENCES contact(id) ON DELETE SET NULL;
