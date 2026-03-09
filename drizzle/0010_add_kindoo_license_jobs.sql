CREATE TABLE kindoo_license_job (
  id TEXT PRIMARY KEY NOT NULL,
  eventId TEXT NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  requestedByUserId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  worker_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  email TEXT NOT NULL,
  description TEXT NOT NULL,
  timezone TEXT NOT NULL,
  start_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_date TEXT NOT NULL,
  end_time TEXT NOT NULL,
  kindoo_access_rule TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  completion_type TEXT,
  status_details TEXT,
  duration_ms INTEGER,
  session_reused INTEGER,
  claimed_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX kindoo_license_job_event_status_idx
  ON kindoo_license_job(eventId, status);

CREATE INDEX kindoo_license_job_status_created_idx
  ON kindoo_license_job(status, created_at);

CREATE INDEX kindoo_license_job_requested_by_idx
  ON kindoo_license_job(requestedByUserId);
