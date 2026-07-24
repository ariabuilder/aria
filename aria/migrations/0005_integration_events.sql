-- Durable, transactionally ordered integration events and their canonical
-- outbox. Queue messages are wakeups only; these rows are the source of truth.

INSERT OR IGNORE INTO aria_site_identity (singleton_id, site_id, created_at)
VALUES (
  1,
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
  substr(lower(hex(randomblob(2))), 2) || '-' ||
  substr('89ab', abs(random()) % 4 + 1, 1) ||
  substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

CREATE TABLE aria_event_aggregate_heads (
  site_id TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  last_sequence INTEGER NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (site_id, aggregate_type, aggregate_id)
);

CREATE TABLE aria_events (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  type TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  aggregate_version TEXT,
  aggregate_sequence INTEGER NOT NULL CHECK (aggregate_sequence > 0),
  actor_id TEXT,
  source TEXT NOT NULL CHECK (source IN ('studio', 'site_api', 'oauth', 'system', 'import')),
  request_id TEXT,
  idempotency_id TEXT,
  payload_json TEXT NOT NULL,
  snapshot_json TEXT,
  snapshot_sha256 TEXT,
  is_tombstone INTEGER NOT NULL DEFAULT 0 CHECK (is_tombstone IN (0, 1)),
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE (site_id, aggregate_type, aggregate_id, aggregate_sequence),
  FOREIGN KEY (idempotency_id) REFERENCES aria_api_idempotency(id) ON DELETE SET NULL
);

CREATE INDEX idx_aria_events_aggregate
  ON aria_events(site_id, aggregate_type, aggregate_id, aggregate_sequence);
CREATE INDEX idx_aria_events_retention ON aria_events(expires_at, id);
CREATE INDEX idx_aria_events_type_created ON aria_events(type, created_at, id);

CREATE TABLE aria_event_outbox (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'claimed', 'dispatched')),
  available_at TEXT NOT NULL,
  lease_token TEXT,
  lease_expires_at TEXT,
  dispatch_attempts INTEGER NOT NULL DEFAULT 0 CHECK (dispatch_attempts >= 0),
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  dispatched_at TEXT,
  FOREIGN KEY (event_id) REFERENCES aria_events(id) ON DELETE CASCADE
);

CREATE INDEX idx_aria_event_outbox_due
  ON aria_event_outbox(state, available_at, lease_expires_at, created_at);

CREATE TABLE aria_integration_audit (
  id TEXT PRIMARY KEY,
  site_id TEXT,
  request_id TEXT,
  event_type TEXT NOT NULL,
  actor_id TEXT,
  resource_type TEXT,
  resource_id TEXT,
  outcome TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX idx_aria_integration_audit_retention
  ON aria_integration_audit(expires_at, id);
