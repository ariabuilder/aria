-- Aria site API foundation. This state is site-internal and is intentionally
-- excluded from content synchronization, export, and starter seed flows.

CREATE TABLE IF NOT EXISTS aria_site_identity (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  site_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS aria_api_credentials (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('personal', 'service')),
  principal_id TEXT NOT NULL,
  created_by_id TEXT NOT NULL,
  audience TEXT NOT NULL,
  name TEXT NOT NULL,
  token_prefix TEXT NOT NULL UNIQUE,
  token_digest TEXT NOT NULL,
  key_id TEXT NOT NULL,
  scopes_json TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  last_used_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (principal_id) REFERENCES aria_users(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_id) REFERENCES aria_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_aria_api_credentials_principal
  ON aria_api_credentials(principal_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_aria_api_credentials_site
  ON aria_api_credentials(site_id, audience, revoked_at);

CREATE TABLE IF NOT EXISTS aria_api_idempotency (
  id TEXT PRIMARY KEY,
  credential_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  method TEXT NOT NULL,
  route_template TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('processing', 'completed')),
  response_status INTEGER,
  response_body_json TEXT,
  response_headers_json TEXT,
  resource_version TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE (credential_id, idempotency_key),
  FOREIGN KEY (credential_id) REFERENCES aria_api_credentials(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_aria_api_idempotency_expiry
  ON aria_api_idempotency(expires_at);

CREATE TABLE IF NOT EXISTS aria_api_security_audit (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  site_id TEXT,
  actor_id TEXT,
  credential_id TEXT,
  event_type TEXT NOT NULL,
  method TEXT,
  route_template TEXT,
  resource_type TEXT,
  resource_id TEXT,
  outcome TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (credential_id) REFERENCES aria_api_credentials(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_aria_api_security_audit_created
  ON aria_api_security_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aria_api_security_audit_expiry
  ON aria_api_security_audit(expires_at);
