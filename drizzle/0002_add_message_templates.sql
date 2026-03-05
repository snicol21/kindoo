CREATE TABLE message_template (
  id text PRIMARY KEY NOT NULL,
  userId text NOT NULL,
  key text NOT NULL,
  body text NOT NULL,
  created_at integer NOT NULL DEFAULT (unixepoch()),
  updated_at integer NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX message_template_user_key_unique
  ON message_template (userId, key);
