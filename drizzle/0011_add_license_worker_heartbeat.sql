CREATE TABLE IF NOT EXISTS license_worker_heartbeat (
  worker_id TEXT PRIMARY KEY NOT NULL,
  host TEXT,
  mode TEXT,
  last_seen_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS license_worker_heartbeat_last_seen_idx
  ON license_worker_heartbeat (last_seen_at);
