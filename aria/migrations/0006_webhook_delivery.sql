-- Site-local webhook endpoints, versioned signing keys, durable deliveries,
-- and immutable attempt history.

CREATE TABLE aria_webhook_endpoints (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disabled')),
  active_signing_key_id TEXT,
  secret_prefix TEXT NOT NULL,
  created_by_id TEXT,
  payload_mode TEXT NOT NULL DEFAULT 'reference' CHECK (payload_mode IN ('reference', 'published_snapshot')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  disabled_at TEXT,
  disabled_reason TEXT,
  FOREIGN KEY (created_by_id) REFERENCES aria_users(id) ON DELETE SET NULL,
  FOREIGN KEY (active_signing_key_id) REFERENCES aria_webhook_signing_keys(id) ON DELETE RESTRICT
);

CREATE TABLE aria_webhook_signing_keys (
  id TEXT PRIMARY KEY,
  endpoint_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  secret_ciphertext TEXT NOT NULL,
  key_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'retiring', 'retired')),
  created_at TEXT NOT NULL,
  retire_after TEXT,
  destroyed_at TEXT,
  UNIQUE (endpoint_id, version),
  FOREIGN KEY (endpoint_id) REFERENCES aria_webhook_endpoints(id) ON DELETE CASCADE
);

CREATE INDEX idx_aria_webhook_signing_keys_retirement
  ON aria_webhook_signing_keys(status, retire_after, endpoint_id);

CREATE TABLE aria_webhook_subscriptions (
  id TEXT PRIMARY KEY,
  endpoint_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  filters_json TEXT,
  created_by_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (endpoint_id, event_type),
  FOREIGN KEY (endpoint_id) REFERENCES aria_webhook_endpoints(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_id) REFERENCES aria_users(id) ON DELETE SET NULL
);

CREATE INDEX idx_aria_webhook_subscriptions_event
  ON aria_webhook_subscriptions(event_type, endpoint_id);

CREATE TABLE aria_webhook_deliveries (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  endpoint_id TEXT NOT NULL,
  endpoint_url TEXT NOT NULL,
  payload_mode TEXT NOT NULL CHECK (payload_mode IN ('reference', 'published_snapshot')),
  body_json TEXT NOT NULL,
  body_sha256 TEXT NOT NULL,
  webhook_signing_key_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'claimed', 'retry_wait', 'delivered', 'terminal', 'cancelled')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at TEXT NOT NULL,
  lease_token TEXT,
  lease_expires_at TEXT,
  last_status INTEGER,
  last_error_code TEXT,
  queue_exhausted_at TEXT,
  first_attempt_at TEXT,
  last_attempt_at TEXT,
  delivered_at TEXT,
  terminal_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (event_id, endpoint_id),
  FOREIGN KEY (event_id) REFERENCES aria_events(id) ON DELETE CASCADE,
  FOREIGN KEY (endpoint_id) REFERENCES aria_webhook_endpoints(id) ON DELETE CASCADE,
  FOREIGN KEY (webhook_signing_key_id) REFERENCES aria_webhook_signing_keys(id) ON DELETE RESTRICT
);

CREATE INDEX idx_aria_webhook_deliveries_due
  ON aria_webhook_deliveries(state, available_at, lease_expires_at, created_at);
CREATE INDEX idx_aria_webhook_deliveries_key_state
  ON aria_webhook_deliveries(webhook_signing_key_id, state);

CREATE TABLE aria_webhook_delivery_attempts (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  request_timestamp INTEGER NOT NULL,
  webhook_signing_key_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  outcome TEXT NOT NULL,
  response_status INTEGER,
  response_excerpt TEXT,
  error_code TEXT,
  completed_at TEXT NOT NULL,
  UNIQUE (delivery_id, attempt_number),
  FOREIGN KEY (delivery_id) REFERENCES aria_webhook_deliveries(id) ON DELETE CASCADE,
  FOREIGN KEY (webhook_signing_key_id) REFERENCES aria_webhook_signing_keys(id) ON DELETE RESTRICT
);

CREATE INDEX idx_aria_webhook_attempts_delivery
  ON aria_webhook_delivery_attempts(delivery_id, attempt_number);

CREATE TABLE aria_integration_worker_heartbeats (
  worker_id TEXT PRIMARY KEY,
  runtime TEXT NOT NULL CHECK (runtime IN ('node')),
  heartbeat_at TEXT NOT NULL,
  ready_until TEXT NOT NULL,
  stopped_at TEXT
);

CREATE INDEX idx_aria_integration_worker_heartbeats_ready
  ON aria_integration_worker_heartbeats(runtime, stopped_at, ready_until);
