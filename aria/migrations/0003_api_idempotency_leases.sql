-- Lease in-flight API mutations so an interrupted request can be retried
-- without allowing two workers to own the same idempotency key concurrently.

ALTER TABLE aria_api_idempotency ADD COLUMN lease_token TEXT;
ALTER TABLE aria_api_idempotency ADD COLUMN lease_expires_at TEXT;

CREATE INDEX IF NOT EXISTS idx_aria_api_idempotency_processing_lease
  ON aria_api_idempotency(state, lease_expires_at);
