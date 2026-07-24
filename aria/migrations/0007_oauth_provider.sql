-- Site-local OAuth provider state for the first-party Figma device client.
-- Codes and tokens are opaque; only purpose-separated keyed digests persist.

CREATE TABLE aria_oauth_clients (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  name TEXT NOT NULL,
  client_type TEXT NOT NULL CHECK (client_type IN ('public', 'confidential')),
  grant_types_json TEXT NOT NULL,
  redirect_uris_json TEXT NOT NULL DEFAULT '[]',
  allowed_scopes_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'revoked')),
  built_in_provider TEXT,
  created_by_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked_at TEXT,
  UNIQUE (site_id, built_in_provider),
  FOREIGN KEY (created_by_id) REFERENCES aria_users(id) ON DELETE SET NULL
);

CREATE INDEX idx_aria_oauth_clients_site_status
  ON aria_oauth_clients(site_id, status, built_in_provider);

CREATE TABLE aria_oauth_grants (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  scopes_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  consented_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  revoked_by_id TEXT,
  revoke_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (site_id, client_id, principal_id),
  FOREIGN KEY (client_id) REFERENCES aria_oauth_clients(id) ON DELETE RESTRICT,
  FOREIGN KEY (principal_id) REFERENCES aria_users(id) ON DELETE CASCADE,
  FOREIGN KEY (revoked_by_id) REFERENCES aria_users(id) ON DELETE SET NULL
);

CREATE INDEX idx_aria_oauth_grants_principal_status
  ON aria_oauth_grants(principal_id, status, client_id);

CREATE TABLE aria_oauth_device_authorizations (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  device_code_prefix TEXT NOT NULL UNIQUE,
  device_code_digest TEXT NOT NULL UNIQUE,
  device_code_key_id TEXT NOT NULL,
  user_code_digest TEXT NOT NULL UNIQUE,
  user_code_key_id TEXT NOT NULL,
  requested_scopes_json TEXT NOT NULL,
  approved_scopes_json TEXT,
  principal_id TEXT,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'approved', 'consumed', 'denied', 'expired')),
  interval_seconds INTEGER NOT NULL CHECK (interval_seconds >= 1),
  next_poll_at TEXT NOT NULL,
  poll_violation_count INTEGER NOT NULL DEFAULT 0 CHECK (poll_violation_count >= 0),
  exchange_lease_token TEXT,
  exchange_lease_expires_at TEXT,
  expires_at TEXT NOT NULL,
  approved_at TEXT,
  consumed_at TEXT,
  denied_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (client_id) REFERENCES aria_oauth_clients(id) ON DELETE CASCADE,
  FOREIGN KEY (principal_id) REFERENCES aria_users(id) ON DELETE CASCADE
);

CREATE INDEX idx_aria_oauth_device_state_expiry
  ON aria_oauth_device_authorizations(state, expires_at, created_at);
CREATE INDEX idx_aria_oauth_device_exchange_lease
  ON aria_oauth_device_authorizations(state, exchange_lease_expires_at);

CREATE TABLE aria_oauth_refresh_families (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  grant_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  current_generation INTEGER NOT NULL DEFAULT 1 CHECK (current_generation >= 1),
  absolute_expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_rotated_at TEXT NOT NULL,
  revoked_at TEXT,
  revoke_reason TEXT,
  FOREIGN KEY (client_id) REFERENCES aria_oauth_clients(id) ON DELETE RESTRICT,
  FOREIGN KEY (grant_id) REFERENCES aria_oauth_grants(id) ON DELETE CASCADE,
  FOREIGN KEY (principal_id) REFERENCES aria_users(id) ON DELETE CASCADE
);

CREATE INDEX idx_aria_oauth_refresh_families_grant
  ON aria_oauth_refresh_families(grant_id, status, absolute_expires_at);

CREATE TABLE aria_oauth_access_tokens (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  grant_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  refresh_family_id TEXT,
  token_prefix TEXT NOT NULL UNIQUE,
  token_digest TEXT NOT NULL,
  key_id TEXT NOT NULL,
  audience TEXT NOT NULL,
  scopes_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_used_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (client_id) REFERENCES aria_oauth_clients(id) ON DELETE RESTRICT,
  FOREIGN KEY (grant_id) REFERENCES aria_oauth_grants(id) ON DELETE CASCADE,
  FOREIGN KEY (principal_id) REFERENCES aria_users(id) ON DELETE CASCADE,
  FOREIGN KEY (refresh_family_id) REFERENCES aria_oauth_refresh_families(id) ON DELETE RESTRICT
);

CREATE INDEX idx_aria_oauth_access_tokens_family
  ON aria_oauth_access_tokens(refresh_family_id, revoked_at, expires_at);
CREATE INDEX idx_aria_oauth_access_tokens_principal
  ON aria_oauth_access_tokens(principal_id, revoked_at, expires_at);

CREATE TABLE aria_oauth_refresh_tokens (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation >= 1),
  token_prefix TEXT NOT NULL UNIQUE,
  token_digest TEXT NOT NULL,
  key_id TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  replaced_by_id TEXT,
  revoked_at TEXT,
  UNIQUE (family_id, generation),
  FOREIGN KEY (family_id) REFERENCES aria_oauth_refresh_families(id) ON DELETE CASCADE,
  FOREIGN KEY (replaced_by_id) REFERENCES aria_oauth_refresh_tokens(id) ON DELETE RESTRICT
);

CREATE INDEX idx_aria_oauth_refresh_tokens_family_state
  ON aria_oauth_refresh_tokens(family_id, consumed_at, revoked_at, expires_at);

CREATE TABLE aria_oauth_idempotency (
  id TEXT PRIMARY KEY,
  access_token_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  method TEXT NOT NULL,
  route_template TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('processing', 'completed')),
  lease_token TEXT,
  lease_expires_at TEXT,
  response_status INTEGER,
  response_body_json TEXT,
  response_headers_json TEXT,
  resource_version TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE (access_token_id, idempotency_key),
  FOREIGN KEY (access_token_id) REFERENCES aria_oauth_access_tokens(id) ON DELETE CASCADE
);

CREATE INDEX idx_aria_oauth_idempotency_expiry
  ON aria_oauth_idempotency(expires_at);
CREATE INDEX idx_aria_oauth_idempotency_processing_lease
  ON aria_oauth_idempotency(state, lease_expires_at);
