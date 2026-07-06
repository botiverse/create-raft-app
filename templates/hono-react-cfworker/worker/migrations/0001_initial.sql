CREATE TABLE IF NOT EXISTS app_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  actor TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  r2_key TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_app_events_created_at
  ON app_events(created_at DESC);

