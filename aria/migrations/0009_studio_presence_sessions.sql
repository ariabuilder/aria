CREATE TABLE IF NOT EXISTS aria_studio_presence_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  surface TEXT NOT NULL CHECK (surface IN ('studio', 'composer')),
  resource_type TEXT CHECK (resource_type IN ('page', 'component', 'layout')),
  resource_id TEXT,
  state TEXT NOT NULL CHECK (state IN ('viewing', 'editing', 'away')),
  dirty INTEGER NOT NULL DEFAULT 0 CHECK (dirty IN (0, 1)),
  connected_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL,
  lease_expires_at INTEGER,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_aria_studio_presence_expires
  ON aria_studio_presence_sessions (expires_at);

CREATE INDEX IF NOT EXISTS idx_aria_studio_presence_user
  ON aria_studio_presence_sessions (user_id, expires_at);
