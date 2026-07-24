-- Harden long-lived API credential and scheduled-publication state before
-- integration events are introduced. This migration intentionally contains no
-- event, webhook, OAuth, or provider-specific fields.

PRAGMA foreign_keys = OFF;

CREATE TABLE aria_api_credentials_v2 (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('personal', 'service')),
  principal_id TEXT NOT NULL,
  created_by_id TEXT,
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
  FOREIGN KEY (created_by_id) REFERENCES aria_users(id) ON DELETE SET NULL
);

INSERT INTO aria_api_credentials_v2 (
  id, site_id, kind, principal_id, created_by_id, audience, name,
  token_prefix, token_digest, key_id, scopes_json, expires_at, revoked_at,
  last_used_at, created_at, updated_at
)
SELECT
  id, site_id, kind, principal_id, created_by_id, audience, name,
  token_prefix, token_digest, key_id, scopes_json, expires_at, revoked_at,
  last_used_at, created_at, updated_at
FROM aria_api_credentials;

DROP TABLE aria_api_credentials;
ALTER TABLE aria_api_credentials_v2 RENAME TO aria_api_credentials;

CREATE INDEX idx_aria_api_credentials_principal
  ON aria_api_credentials(principal_id, revoked_at);
CREATE INDEX idx_aria_api_credentials_site
  ON aria_api_credentials(site_id, audience, revoked_at);
CREATE INDEX idx_aria_api_credentials_revoked_cleanup
  ON aria_api_credentials(revoked_at, id)
  WHERE revoked_at IS NOT NULL;
CREATE INDEX idx_aria_api_credentials_expired_cleanup
  ON aria_api_credentials(expires_at, id)
  WHERE expires_at IS NOT NULL;

PRAGMA foreign_keys = ON;

ALTER TABLE aria_page_meta ADD COLUMN scheduled_version TEXT;
ALTER TABLE aria_entries ADD COLUMN scheduled_version TEXT;

UPDATE aria_page_meta
SET scheduled_version = current_version
WHERE status = 'scheduled' AND scheduled_for IS NOT NULL;
UPDATE aria_entries
SET scheduled_version = version
WHERE status = 'scheduled' AND scheduled_for IS NOT NULL;

CREATE INDEX idx_aria_page_meta_schedule_due
  ON aria_page_meta(status, scheduled_for, scheduled_version)
  WHERE status = 'scheduled';
CREATE INDEX idx_aria_entries_schedule_due
  ON aria_entries(status, scheduled_for, scheduled_version, collection_id)
  WHERE status = 'scheduled';

CREATE INDEX idx_aria_api_idempotency_cleanup
  ON aria_api_idempotency(state, expires_at, id);
CREATE INDEX idx_aria_api_security_audit_cleanup
  ON aria_api_security_audit(expires_at, id);
