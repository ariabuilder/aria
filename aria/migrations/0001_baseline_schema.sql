-- ============================================================================
-- Aria Baseline Schema
-- Migration: 0001_baseline_schema.sql
--
-- Single canonical schema for a fresh Aria install (local SQLite or remote D1).
-- Every statement uses IF NOT EXISTS for idempotent application.
--
-- Local SQLite applies this file once via aria_schema_migrations tracking
-- (see aria/lib/storage/runStorageMigrations.ts). D1 applies it via Wrangler
-- migrations_dir.
-- ============================================================================

-- ============================================================================
-- SCHEMA MIGRATIONS: local SQLite run-once ledger (D1 parity)
-- ============================================================================

CREATE TABLE IF NOT EXISTS aria_schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

-- ============================================================================
-- AUTH: users, sessions, config, rate limiting, password resets
-- ============================================================================

CREATE TABLE IF NOT EXISTS aria_users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  name TEXT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('administrator', 'manager', 'content-editor', 'contributor')),
  totp_secret TEXT,
  totp_enabled INTEGER DEFAULT 0,
  backup_codes TEXT,
  backup_codes_used TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  avatar_url TEXT,
  permission_profile TEXT,
  preferences TEXT,
  oauth_provider TEXT,
  oauth_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_email ON aria_users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON aria_users(username);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oauth_identity
  ON aria_users(oauth_provider, oauth_id)
  WHERE oauth_provider IS NOT NULL AND oauth_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS aria_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  remember_me INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  auth_method TEXT,
  ip TEXT,
  user_agent TEXT,
  FOREIGN KEY (user_id) REFERENCES aria_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON aria_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON aria_sessions(expires_at);

CREATE TABLE IF NOT EXISTS aria_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS aria_login_attempts (
  ip TEXT PRIMARY KEY,
  attempts INTEGER DEFAULT 0,
  last_attempt TEXT NOT NULL
);

-- Shared, atomic rate-limit counters. `subject_hash` is a SHA-256 digest, so
-- page-password and media-action limits do not persist raw IPs or actor ids.
CREATE TABLE IF NOT EXISTS aria_rate_limits (
  scope TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL,
  PRIMARY KEY (scope, subject_hash)
);

CREATE INDEX IF NOT EXISTS idx_aria_rate_limits_reset_at
  ON aria_rate_limits(reset_at);

CREATE TABLE IF NOT EXISTS aria_password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES aria_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user ON aria_password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_token ON aria_password_resets(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_resets_expires ON aria_password_resets(expires_at);

-- ============================================================================
-- AUTH: modern foundation — passkeys, general tokens, audit, WebAuthn
-- ============================================================================

CREATE TABLE IF NOT EXISTS aria_passkey_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  credential_id TEXT UNIQUE NOT NULL,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  device_name TEXT,
  transports TEXT,
  backed_up INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  FOREIGN KEY (user_id) REFERENCES aria_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_passkey_user ON aria_passkey_credentials(user_id);

CREATE TABLE IF NOT EXISTS aria_auth_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('password_reset', 'login', 'invite', 'email_verify')),
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  metadata TEXT,
  FOREIGN KEY (user_id) REFERENCES aria_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON aria_auth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON aria_auth_tokens(token_hash);

CREATE TABLE IF NOT EXISTS aria_auth_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  event_type TEXT NOT NULL,
  auth_method TEXT,
  ip TEXT,
  user_agent TEXT,
  success INTEGER NOT NULL DEFAULT 0,
  metadata TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES aria_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_events_user_created ON aria_auth_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_auth_events_created ON aria_auth_events(created_at);

CREATE TABLE IF NOT EXISTS aria_webauthn_challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('register', 'login')),
  user_id TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES aria_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_expires ON aria_webauthn_challenges(expires_at);

-- ============================================================================
-- CANONICAL STORAGE: pages, layouts, components, styles, settings
-- ============================================================================

CREATE TABLE IF NOT EXISTS aria_page_versions (
  id TEXT NOT NULL,
  version TEXT NOT NULL,
  slug TEXT,
  title TEXT,
  status TEXT,
  dsl_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  content_hash TEXT,
  compiler_metadata_json TEXT,
  created_by_id TEXT,
  created_by_username TEXT,
  created_by_email TEXT,
  created_by_avatar_url TEXT,
  activity_metadata TEXT,
  PRIMARY KEY (id, version)
);

CREATE INDEX IF NOT EXISTS idx_aria_page_versions_id_created_at ON aria_page_versions (id, created_at);
CREATE INDEX IF NOT EXISTS idx_aria_page_versions_id_content_hash ON aria_page_versions(id, content_hash);

CREATE TABLE IF NOT EXISTS aria_page_meta (
  id TEXT PRIMARY KEY,
  slug TEXT,
  title TEXT,
  status TEXT,
  parent TEXT,
  layout TEXT,
  draft_version TEXT,
  published_version TEXT,
  current_version TEXT NOT NULL,
  system_role TEXT NOT NULL DEFAULT 'standard' CHECK (system_role IN ('standard', 'not-found', 'cms-collection', 'cms-entry')),
  access_mode TEXT NOT NULL DEFAULT 'public' CHECK (access_mode IN ('public', 'password', 'private', 'unlisted')),
  access_password_hash TEXT,
  access_prompt_title TEXT,
  access_prompt_description TEXT,
  access_remember_for_days INTEGER CHECK (access_remember_for_days IS NULL OR access_remember_for_days BETWEEN 1 AND 30),
  access_policy_version INTEGER NOT NULL DEFAULT 1,
  scheduled_for TEXT,
  schedule_lease_token TEXT,
  schedule_lease_expires_at TEXT,
  schedule_attempt_count INTEGER NOT NULL DEFAULT 0,
  last_schedule_error TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_aria_page_meta_slug ON aria_page_meta (slug);
CREATE INDEX IF NOT EXISTS idx_aria_page_meta_access_mode ON aria_page_meta(access_mode);
CREATE INDEX IF NOT EXISTS idx_aria_page_meta_scheduled_for
  ON aria_page_meta (scheduled_for)
  WHERE status = 'scheduled';
CREATE UNIQUE INDEX IF NOT EXISTS idx_aria_page_meta_system_role_unique
  ON aria_page_meta(system_role)
  WHERE system_role = 'not-found';

CREATE TABLE IF NOT EXISTS aria_layout_versions (
  id TEXT NOT NULL,
  version TEXT NOT NULL,
  name TEXT,
  status TEXT,
  dsl_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  content_hash TEXT,
  created_by_id TEXT,
  created_by_username TEXT,
  created_by_email TEXT,
  created_by_avatar_url TEXT,
  PRIMARY KEY (id, version)
);

CREATE INDEX IF NOT EXISTS idx_aria_layout_versions_id_created_at ON aria_layout_versions (id, created_at);
CREATE INDEX IF NOT EXISTS idx_aria_layout_versions_id_content_hash ON aria_layout_versions(id, content_hash);

CREATE TABLE IF NOT EXISTS aria_layout_meta (
  id TEXT PRIMARY KEY,
  name TEXT,
  description TEXT,
  status TEXT,
  current_version TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ============================================================================
-- SITE LOCALIZATION: page/layout locale versions, route ownership, invalidation
-- ============================================================================

-- Locale versions deliberately reference their canonical owner rather than
-- locale metadata so a version can be inserted before its metadata pointers
-- are created. The metadata table then protects active pointers with composite
-- foreign keys below.
CREATE TABLE IF NOT EXISTS aria_page_locale_versions (
  page_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  version TEXT NOT NULL,
  source_version TEXT NOT NULL,
  slug TEXT,
  access_prompt_title TEXT,
  access_prompt_description TEXT,
  seo_json TEXT NOT NULL,
  dsl_json TEXT NOT NULL,
  translated_paths_json TEXT NOT NULL,
  source_manifest_hash TEXT NOT NULL,
  source_structure_hash TEXT NOT NULL,
  layout_id TEXT,
  fallback_layout_version TEXT,
  content_hash TEXT,
  created_at TEXT NOT NULL,
  created_by_id TEXT,
  created_by_username TEXT,
  created_by_email TEXT,
  created_by_avatar_url TEXT,
  activity_metadata TEXT,
  PRIMARY KEY (page_id, locale, version),
  FOREIGN KEY (page_id) REFERENCES aria_page_meta(id) ON DELETE CASCADE,
  FOREIGN KEY (page_id, source_version)
    REFERENCES aria_page_versions(id, version) ON DELETE RESTRICT,
  FOREIGN KEY (layout_id, fallback_layout_version)
    REFERENCES aria_layout_versions(id, version) ON DELETE RESTRICT,
  CHECK (
    (layout_id IS NULL AND fallback_layout_version IS NULL)
    OR (layout_id IS NOT NULL AND fallback_layout_version IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_aria_page_locale_versions_history
  ON aria_page_locale_versions(page_id, locale, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aria_page_locale_versions_source
  ON aria_page_locale_versions(page_id, locale, source_version);
CREATE INDEX IF NOT EXISTS idx_aria_page_locale_versions_content_hash
  ON aria_page_locale_versions(page_id, locale, content_hash);
CREATE INDEX IF NOT EXISTS idx_aria_page_locale_versions_layout_pin
  ON aria_page_locale_versions(layout_id, fallback_layout_version)
  WHERE layout_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS aria_page_locale_meta (
  page_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  draft_version TEXT NOT NULL,
  published_version TEXT,
  current_version TEXT NOT NULL,
  published_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (page_id, locale),
  FOREIGN KEY (page_id) REFERENCES aria_page_meta(id) ON DELETE CASCADE,
  FOREIGN KEY (page_id, locale, draft_version)
    REFERENCES aria_page_locale_versions(page_id, locale, version) ON DELETE RESTRICT,
  FOREIGN KEY (page_id, locale, current_version)
    REFERENCES aria_page_locale_versions(page_id, locale, version) ON DELETE RESTRICT,
  FOREIGN KEY (page_id, locale, published_version)
    REFERENCES aria_page_locale_versions(page_id, locale, version) ON DELETE RESTRICT,
  CHECK (published_version IS NOT NULL OR published_at IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_aria_page_locale_meta_page_updated
  ON aria_page_locale_meta(page_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_aria_page_locale_meta_locale_published
  ON aria_page_locale_meta(locale, published_version)
  WHERE published_version IS NOT NULL;

-- A route may be simultaneously owned by the draft and published pointer for
-- one page. A renamed draft holds a second row while the previous published
-- route remains valid, so draft saves never move live traffic.
CREATE TABLE IF NOT EXISTS aria_page_locale_routes (
  locale TEXT NOT NULL,
  pathname_key TEXT NOT NULL,
  pathname TEXT NOT NULL,
  page_id TEXT NOT NULL,
  draft_claim INTEGER NOT NULL DEFAULT 0 CHECK (draft_claim IN (0, 1)),
  published_claim INTEGER NOT NULL DEFAULT 0 CHECK (published_claim IN (0, 1)),
  PRIMARY KEY (locale, pathname_key),
  FOREIGN KEY (page_id, locale)
    REFERENCES aria_page_locale_meta(page_id, locale) ON DELETE CASCADE,
  CHECK (draft_claim = 1 OR published_claim = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_aria_page_locale_routes_draft_owner
  ON aria_page_locale_routes(page_id, locale)
  WHERE draft_claim = 1;
CREATE UNIQUE INDEX IF NOT EXISTS idx_aria_page_locale_routes_published_owner
  ON aria_page_locale_routes(page_id, locale)
  WHERE published_claim = 1;
CREATE INDEX IF NOT EXISTS idx_aria_page_locale_routes_page
  ON aria_page_locale_routes(page_id, locale);

-- Route leases serialize the final collision check/write across page, CMS,
-- redirect, and locale-settings mutations on D1 as well as local SQLite.
CREATE TABLE IF NOT EXISTS aria_locale_route_leases (
  locale TEXT PRIMARY KEY,
  lease_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_aria_locale_route_leases_expires
  ON aria_locale_route_leases(expires_at);

CREATE TABLE IF NOT EXISTS aria_layout_locale_versions (
  layout_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  version TEXT NOT NULL,
  source_version TEXT NOT NULL,
  dsl_json TEXT NOT NULL,
  translated_paths_json TEXT NOT NULL,
  source_manifest_hash TEXT NOT NULL,
  source_structure_hash TEXT NOT NULL,
  content_hash TEXT,
  created_at TEXT NOT NULL,
  created_by_id TEXT,
  created_by_username TEXT,
  created_by_email TEXT,
  created_by_avatar_url TEXT,
  activity_metadata TEXT,
  PRIMARY KEY (layout_id, locale, version),
  FOREIGN KEY (layout_id) REFERENCES aria_layout_meta(id) ON DELETE CASCADE,
  FOREIGN KEY (layout_id, source_version)
    REFERENCES aria_layout_versions(id, version) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_aria_layout_locale_versions_history
  ON aria_layout_locale_versions(layout_id, locale, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aria_layout_locale_versions_source
  ON aria_layout_locale_versions(layout_id, locale, source_version);
CREATE INDEX IF NOT EXISTS idx_aria_layout_locale_versions_content_hash
  ON aria_layout_locale_versions(layout_id, locale, content_hash);

CREATE TABLE IF NOT EXISTS aria_layout_locale_meta (
  layout_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  draft_version TEXT NOT NULL,
  published_version TEXT,
  current_version TEXT NOT NULL,
  published_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (layout_id, locale),
  FOREIGN KEY (layout_id) REFERENCES aria_layout_meta(id) ON DELETE CASCADE,
  FOREIGN KEY (layout_id, locale, draft_version)
    REFERENCES aria_layout_locale_versions(layout_id, locale, version) ON DELETE RESTRICT,
  FOREIGN KEY (layout_id, locale, current_version)
    REFERENCES aria_layout_locale_versions(layout_id, locale, version) ON DELETE RESTRICT,
  FOREIGN KEY (layout_id, locale, published_version)
    REFERENCES aria_layout_locale_versions(layout_id, locale, version) ON DELETE RESTRICT,
  CHECK (published_version IS NOT NULL OR published_at IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_aria_layout_locale_meta_layout_updated
  ON aria_layout_locale_meta(layout_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_aria_layout_locale_meta_locale_published
  ON aria_layout_locale_meta(locale, published_version)
  WHERE published_version IS NOT NULL;

-- Durable delivery intent. The cache remains an acceleration layer; this
-- outbox makes post-commit purge/rebuild failures observable and retryable.
CREATE TABLE IF NOT EXISTS aria_cache_invalidation_jobs (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL CHECK (
    scope IN ('public-route', 'discovery', 'rss', 'locale-policy', 'all')
  ),
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'succeeded', 'failed')
  ),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TEXT NOT NULL,
  lease_token TEXT,
  lease_expires_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_aria_cache_invalidation_jobs_due
  ON aria_cache_invalidation_jobs(status, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS idx_aria_cache_invalidation_jobs_lease
  ON aria_cache_invalidation_jobs(lease_expires_at)
  WHERE lease_expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS aria_component_versions (
  id TEXT NOT NULL,
  version TEXT NOT NULL,
  name TEXT,
  category TEXT,
  dsl_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  content_hash TEXT,
  created_by_id TEXT,
  created_by_username TEXT,
  created_by_email TEXT,
  created_by_avatar_url TEXT,
  PRIMARY KEY (id, version)
);

CREATE INDEX IF NOT EXISTS idx_aria_component_versions_id_created_at ON aria_component_versions (id, created_at);
CREATE INDEX IF NOT EXISTS idx_aria_component_versions_id_content_hash ON aria_component_versions(id, content_hash);

CREATE TABLE IF NOT EXISTS aria_component_meta (
  id TEXT PRIMARY KEY,
  name TEXT,
  description TEXT,
  category TEXT,
  source TEXT,
  tier TEXT,
  is_locked INTEGER,
  pack_id TEXT,
  current_version TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_aria_component_meta_category ON aria_component_meta (category);

CREATE TABLE IF NOT EXISTS aria_styles (
  id TEXT PRIMARY KEY,
  styles_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by_id TEXT,
  created_by_username TEXT,
  created_by_email TEXT,
  updated_by_id TEXT,
  updated_by_username TEXT,
  updated_by_email TEXT
);

CREATE TABLE IF NOT EXISTS aria_site_settings (
  id TEXT PRIMARY KEY,
  settings_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by_id TEXT,
  created_by_username TEXT,
  created_by_email TEXT,
  updated_by_id TEXT,
  updated_by_username TEXT,
  updated_by_email TEXT
);

CREATE TABLE IF NOT EXISTS aria_order (
  kind TEXT PRIMARY KEY,
  order_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS aria_page_metadata (
  slug TEXT PRIMARY KEY,
  metadata_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by_id TEXT,
  created_by_username TEXT,
  created_by_email TEXT,
  updated_by_id TEXT,
  updated_by_username TEXT,
  updated_by_email TEXT
);

CREATE TABLE IF NOT EXISTS aria_resource_touches (
  resource_name TEXT PRIMARY KEY,
  touched_at TEXT NOT NULL
);

-- ============================================================================
-- MEDIA: canonical asset catalog, sync, usage tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS aria_media_assets (
  id TEXT PRIMARY KEY,
  logical_path TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  extension TEXT,
  mime_type TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  checksum_sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  created_by_id TEXT,
  created_by_username TEXT,
  created_by_email TEXT,
  updated_by_id TEXT,
  updated_by_username TEXT,
  updated_by_email TEXT,
  deleted_by_id TEXT,
  deleted_by_username TEXT,
  deleted_by_email TEXT
);

CREATE INDEX IF NOT EXISTS idx_aria_media_assets_status ON aria_media_assets(status);
CREATE INDEX IF NOT EXISTS idx_aria_media_assets_updated_at ON aria_media_assets(updated_at);
CREATE INDEX IF NOT EXISTS idx_aria_media_assets_checksum ON aria_media_assets(checksum_sha256);

CREATE TABLE IF NOT EXISTS aria_media_locations (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL,
  endpoint_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  public_url TEXT,
  etag TEXT,
  version_id TEXT,
  size_bytes INTEGER,
  checksum_sha256 TEXT,
  exists_remote INTEGER NOT NULL DEFAULT 1 CHECK (exists_remote IN (0, 1)),
  last_verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(media_id, endpoint_id),
  FOREIGN KEY(media_id) REFERENCES aria_media_assets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_aria_media_locations_endpoint ON aria_media_locations(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_aria_media_locations_key ON aria_media_locations(object_key);

-- Runtime-neutral image editing state. Records use the normalized logical path
-- because local SQLite assets do not require a catalog UUID, while D1 assets do.
CREATE TABLE IF NOT EXISTS aria_media_profiles (
  asset_path TEXT PRIMARY KEY,
  current_source_version INTEGER NOT NULL DEFAULT 1 CHECK (current_source_version > 0),
  alt_text TEXT,
  title TEXT,
  caption TEXT,
  credit TEXT,
  copyright TEXT,
  focal_point_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS aria_media_source_versions (
  asset_path TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  object_key TEXT NOT NULL,
  checksum_sha256 TEXT,
  mime_type TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY (asset_path, version)
);

CREATE INDEX IF NOT EXISTS idx_aria_media_source_versions_asset
  ON aria_media_source_versions(asset_path, version DESC);

CREATE TABLE IF NOT EXISTS aria_media_transform_variants (
  id TEXT PRIMARY KEY,
  asset_path TEXT NOT NULL,
  name TEXT NOT NULL,
  source_version INTEGER NOT NULL CHECK (source_version > 0),
  crop_json TEXT NOT NULL,
  focal_point_json TEXT,
  aspect_ratio_json TEXT,
  output_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(asset_path, name)
);

CREATE INDEX IF NOT EXISTS idx_aria_media_transform_variants_asset
  ON aria_media_transform_variants(asset_path, name);

CREATE TABLE IF NOT EXISTS aria_media_sync_jobs (
  id TEXT PRIMARY KEY,
  direction TEXT NOT NULL CHECK (direction IN ('push', 'pull')),
  source_endpoint_id TEXT NOT NULL,
  target_endpoint_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('dry-run', 'apply')),
  conflict_policy TEXT NOT NULL CHECK (conflict_policy IN ('local-wins', 'remote-wins', 'newest-wins', 'manual')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'canceled')),
  summary_json TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  plan_job_id TEXT,
  idempotency_key TEXT
);

CREATE INDEX IF NOT EXISTS idx_aria_media_sync_jobs_status ON aria_media_sync_jobs(status);
CREATE INDEX IF NOT EXISTS idx_aria_media_sync_jobs_created_at ON aria_media_sync_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_aria_media_sync_jobs_plan_job_id ON aria_media_sync_jobs(plan_job_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_aria_media_sync_jobs_idempotency_key_apply
  ON aria_media_sync_jobs(idempotency_key)
  WHERE mode = 'apply' AND idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS aria_media_sync_items (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  media_id TEXT,
  logical_path TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'skip', 'conflict')),
  reason TEXT,
  source_checksum TEXT,
  target_checksum TEXT,
  source_etag TEXT,
  target_etag TEXT,
  result_status TEXT NOT NULL CHECK (result_status IN ('planned', 'applied', 'failed', 'skipped')),
  error_message TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(job_id) REFERENCES aria_media_sync_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_aria_media_sync_items_job ON aria_media_sync_items(job_id);
CREATE INDEX IF NOT EXISTS idx_aria_media_sync_items_action ON aria_media_sync_items(action);

CREATE TABLE IF NOT EXISTS aria_media_usage (
  id TEXT PRIMARY KEY,
  media_id TEXT,
  logical_path TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('page', 'layout', 'component', 'cms-entry', 'page-locale', 'layout-locale', 'site-settings', 'design-system')),
  ref_id TEXT NOT NULL,
  ref_path TEXT,
  updated_at TEXT NOT NULL,
  CHECK (media_id IS NOT NULL OR logical_path IS NOT NULL),
  UNIQUE(logical_path, kind, ref_id),
  FOREIGN KEY(media_id) REFERENCES aria_media_assets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_aria_media_usage_media ON aria_media_usage(media_id);
CREATE INDEX IF NOT EXISTS idx_aria_media_usage_path ON aria_media_usage(logical_path);
CREATE INDEX IF NOT EXISTS idx_aria_media_usage_ref ON aria_media_usage(kind, ref_id);

-- ============================================================================
-- SNAPSHOTS & THUMBNAILS
-- ============================================================================

CREATE TABLE IF NOT EXISTS aria_snapshots (
  slug TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'published' CHECK (stage IN ('draft', 'published')),
  html TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (slug, stage)
);

CREATE INDEX IF NOT EXISTS idx_aria_snapshots_stage_updated_at ON aria_snapshots(stage, updated_at DESC);

CREATE TABLE IF NOT EXISTS aria_thumbnails (
  kind TEXT NOT NULL CHECK (kind IN ('page', 'component', 'layout')),
  ref_id TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'default' CHECK (stage IN ('default', 'draft', 'published')),
  content_type TEXT NOT NULL CHECK (content_type IN ('image/webp', 'image/png')),
  size_bytes INTEGER NOT NULL DEFAULT 0,
  image_blob BLOB NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (kind, ref_id, stage)
);

CREATE INDEX IF NOT EXISTS idx_aria_thumbnails_kind_updated_at ON aria_thumbnails(kind, updated_at DESC);

CREATE TABLE IF NOT EXISTS aria_thumbnail_artifacts (
  kind TEXT NOT NULL CHECK (kind IN ('page', 'component', 'layout')),
  target_id TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'default' CHECK (stage IN ('default', 'draft', 'published')),
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'missing' CHECK (status IN ('missing', 'queued', 'running', 'ready', 'stale', 'failed')),
  artifact_key TEXT,
  content_type TEXT CHECK (content_type IN ('image/webp', 'image/png')),
  width INTEGER,
  height INTEGER,
  size_bytes INTEGER,
  etag TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (kind, target_id, stage, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_aria_thumbnail_artifacts_current
  ON aria_thumbnail_artifacts(kind, target_id, stage, updated_at DESC);

CREATE TABLE IF NOT EXISTS aria_thumbnail_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('page', 'component', 'layout')),
  target_id TEXT NOT NULL,
  target_slug TEXT,
  stage TEXT NOT NULL DEFAULT 'default' CHECK (stage IN ('default', 'draft', 'published')),
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  force INTEGER NOT NULL DEFAULT 0 CHECK (force IN (0, 1)),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_aria_thumbnail_jobs_dedupe
  ON aria_thumbnail_jobs(kind, target_id, stage, fingerprint)
  WHERE status IN ('queued', 'running');

-- ============================================================================
-- CONTENT SYNC (local <-> remote push/pull)
-- ============================================================================

CREATE TABLE IF NOT EXISTS aria_content_site_state (
  scope TEXT PRIMARY KEY DEFAULT 'default',
  current_revision_id TEXT NOT NULL,
  revision_seq INTEGER NOT NULL DEFAULT 0,
  content_digest TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  last_mutation_kind TEXT NOT NULL CHECK (
    last_mutation_kind IN (
      'save-page', 'delete-page', 'save-layout', 'delete-layout',
      'save-component', 'delete-component', 'save-styles',
      'save-site-settings', 'save-order', 'save-snapshot',
      'delete-snapshot', 'save-page-metadata', 'push', 'pull',
      'seed', 'migrate-json'
    )
  ),
  last_mutation_target TEXT,
  schema_version TEXT
);

CREATE TABLE IF NOT EXISTS aria_content_sync_jobs (
  id TEXT PRIMARY KEY,
  direction TEXT NOT NULL CHECK (direction IN ('push', 'pull')),
  mode TEXT NOT NULL CHECK (mode IN ('dry-run', 'apply')),
  status TEXT NOT NULL CHECK (status IN ('planned', 'running', 'completed', 'failed', 'canceled')),
  source_endpoint_id TEXT NOT NULL,
  target_endpoint_id TEXT NOT NULL,
  conflict_policy TEXT NOT NULL CHECK (conflict_policy IN ('manual', 'newest-wins', 'local-wins', 'remote-wins')),
  local_revision_id TEXT,
  remote_revision_id TEXT,
  result_local_revision_id TEXT,
  result_remote_revision_id TEXT,
  summary_json TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  plan_job_id TEXT,
  idempotency_key TEXT,
  notes TEXT,
  FOREIGN KEY (plan_job_id) REFERENCES aria_content_sync_jobs(id)
);

CREATE INDEX IF NOT EXISTS idx_aria_content_sync_jobs_mode_created_at ON aria_content_sync_jobs(mode, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aria_content_sync_jobs_direction_created_at ON aria_content_sync_jobs(direction, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aria_content_sync_jobs_status_created_at ON aria_content_sync_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aria_content_sync_jobs_plan_job_id ON aria_content_sync_jobs(plan_job_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_aria_content_sync_jobs_idempotency_key
  ON aria_content_sync_jobs(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS aria_content_sync_items (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (
    resource_type IN (
      'page', 'layout', 'component', 'styles', 'site-settings',
      'cms-collection', 'cms-entry', 'order', 'snapshot', 'metadata'
    )
  ),
  resource_id TEXT NOT NULL,
  resource_label TEXT,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'skip', 'conflict')),
  local_version TEXT,
  remote_version TEXT,
  local_checksum TEXT,
  remote_checksum TEXT,
  result_status TEXT NOT NULL CHECK (result_status IN ('planned', 'applied', 'skipped', 'conflicted', 'failed')),
  conflict_reason TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES aria_content_sync_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_aria_content_sync_items_job_id_created_at ON aria_content_sync_items(job_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_aria_content_sync_items_resource ON aria_content_sync_items(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_aria_content_sync_items_action ON aria_content_sync_items(action);
CREATE INDEX IF NOT EXISTS idx_aria_content_sync_items_result_status ON aria_content_sync_items(result_status);

-- ============================================================================
-- REDIRECTS & SETTINGS AUDIT
-- ============================================================================

CREATE TABLE IF NOT EXISTS aria_redirects (
  id TEXT PRIMARY KEY NOT NULL,
  from_path TEXT NOT NULL UNIQUE,
  to_path TEXT NOT NULL,
  status_code INTEGER NOT NULL CHECK (status_code IN (301, 302)),
  enabled INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  created_at TEXT NOT NULL,
  created_by_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_aria_redirects_from_path ON aria_redirects(from_path);
CREATE INDEX IF NOT EXISTS idx_aria_redirects_enabled ON aria_redirects(enabled);

CREATE TABLE IF NOT EXISTS aria_settings_audit (
  id TEXT PRIMARY KEY NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('discovery', 'redirects', 'agent', 'security')),
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_username TEXT,
  summary TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_aria_settings_audit_category ON aria_settings_audit(category, created_at DESC);

-- ============================================================================
-- AGENT / MCP
-- ============================================================================

CREATE TABLE IF NOT EXISTS aria_mcp_tokens (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('personal', 'service')),
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  user_id TEXT,
  created_by_user_id TEXT NOT NULL,
  created_by_username TEXT NOT NULL DEFAULT '',
  scopes TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_mcp_tokens_hash ON aria_mcp_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_user ON aria_mcp_tokens(user_id);

CREATE TABLE IF NOT EXISTS aria_agent_activity (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  transport TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  resource TEXT,
  status TEXT NOT NULL,
  message TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_activity_created ON aria_agent_activity(created_at);

-- ============================================================================
-- AGENT CONTROL PLANE AND AI USAGE
-- ============================================================================

CREATE TABLE IF NOT EXISTS aria_agent_mutations (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  resource_key TEXT,
  before_version TEXT,
  after_version TEXT,
  reversibility TEXT NOT NULL,
  inverse_tool_name TEXT,
  inverse_args_json TEXT,
  status TEXT NOT NULL DEFAULT 'ready',
  undone_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_mutations_resource
  ON aria_agent_mutations(site_id, resource_key, created_at DESC);

CREATE TABLE IF NOT EXISTS aria_ai_inference_runs (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  provider_instance_id TEXT NOT NULL,
  backend TEXT NOT NULL,
  model_id TEXT NOT NULL,
  billing_mode TEXT NOT NULL,
  route_type TEXT NOT NULL,
  transport TEXT NOT NULL,
  feature TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  finish_reason TEXT,
  error_code TEXT,
  UNIQUE(site_id, request_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_runs_site_started
  ON aria_ai_inference_runs(site_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_runs_user_started
  ON aria_ai_inference_runs(user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS aria_ai_usage_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  reasoning_tokens INTEGER,
  cached_input_tokens INTEGER,
  estimated_cost_micros INTEGER,
  provider_reported_cost_micros INTEGER,
  currency TEXT NOT NULL,
  pricing_source TEXT,
  pricing_version TEXT,
  provider_request_id TEXT,
  gateway_request_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(run_id, attempt),
  FOREIGN KEY(run_id) REFERENCES aria_ai_inference_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_run
  ON aria_ai_usage_events(run_id, attempt);

CREATE TABLE IF NOT EXISTS aria_ai_quota_policies (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT,
  metric TEXT NOT NULL,
  window_seconds INTEGER NOT NULL,
  warning_limit INTEGER,
  hard_limit INTEGER NOT NULL,
  reservation_units INTEGER NOT NULL,
  billing_modes_json TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_quota_policies_site
  ON aria_ai_quota_policies(site_id, enabled);

CREATE TABLE IF NOT EXISTS aria_ai_quota_reservations (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  window_start TEXT NOT NULL,
  reserved_units INTEGER NOT NULL,
  actual_units INTEGER,
  status TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  reconciled_at TEXT,
  UNIQUE(run_id, policy_id)
);

CREATE TABLE IF NOT EXISTS aria_ai_quota_buckets (
  policy_id TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  window_start TEXT NOT NULL,
  reserved_units INTEGER NOT NULL DEFAULT 0,
  consumed_units INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(policy_id, subject_key, window_start)
);

CREATE TABLE IF NOT EXISTS aria_mcp_connections (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  name TEXT NOT NULL,
  server_url TEXT NOT NULL,
  trust_tier TEXT NOT NULL DEFAULT 'read_only',
  enabled INTEGER NOT NULL DEFAULT 0,
  server_identity TEXT,
  manifest_fingerprint TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(site_id, name)
);

CREATE INDEX IF NOT EXISTS idx_mcp_connections_site
  ON aria_mcp_connections(site_id, enabled);

CREATE TABLE IF NOT EXISTS agent_session_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  tool_call_id TEXT,
  version INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_agent_session_messages_lookup ON agent_session_messages (session_id, user_id, created_at);

-- ============================================================================
-- EMAIL
-- ============================================================================

CREATE TABLE IF NOT EXISTS aria_email_connections (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL DEFAULT 'default',
  name TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('cloudflare_email', 'smtp', 'preview')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  from_email TEXT NOT NULL,
  from_name TEXT,
  reply_to_email TEXT,
  config_json TEXT NOT NULL,
  credential_state TEXT NOT NULL DEFAULT 'missing' CHECK (credential_state IN ('missing', 'configured', 'invalid')),
  health_state TEXT NOT NULL DEFAULT 'untested' CHECK (health_state IN ('untested', 'healthy', 'degraded', 'failed')),
  last_checked_at TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  UNIQUE (site_id, name)
);

CREATE INDEX IF NOT EXISTS idx_email_connections_site_provider ON aria_email_connections(site_id, provider, enabled);

CREATE TABLE IF NOT EXISTS aria_email_keyring (
  key_id TEXT PRIMARY KEY,
  key_base64 TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'managed-d1' CHECK (source IN ('managed-d1')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS aria_email_connection_secrets (
  connection_id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL DEFAULT 'default',
  ciphertext_base64 TEXT NOT NULL,
  iv_base64 TEXT NOT NULL,
  key_id TEXT NOT NULL,
  algorithm TEXT NOT NULL CHECK (algorithm = 'AES-256-GCM'),
  created_at TEXT NOT NULL,
  rotated_at TEXT,
  UNIQUE (site_id, connection_id),
  FOREIGN KEY (connection_id) REFERENCES aria_email_connections(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS aria_email_routes (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL DEFAULT 'default',
  purpose TEXT NOT NULL CHECK (purpose IN ('system', 'forms')),
  connection_id TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0 CHECK (priority >= 0),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (site_id, purpose, connection_id),
  FOREIGN KEY (connection_id) REFERENCES aria_email_connections(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_routes_site_purpose ON aria_email_routes(site_id, purpose, enabled, priority);

CREATE TABLE IF NOT EXISTS aria_email_deliveries (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL DEFAULT 'default',
  purpose TEXT NOT NULL CHECK (purpose IN ('system', 'forms')),
  template_key TEXT NOT NULL,
  template_version INTEGER NOT NULL CHECK (template_version > 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'retry_scheduled', 'accepted', 'failed_permanent', 'canceled')),
  provider_disposition TEXT,
  connection_id TEXT,
  to_json TEXT NOT NULL,
  cc_json TEXT NOT NULL DEFAULT '[]',
  bcc_json TEXT NOT NULL DEFAULT '[]',
  subject TEXT,
  payload_ciphertext_base64 TEXT,
  payload_iv_base64 TEXT,
  payload_key_id TEXT,
  idempotency_key TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
  next_attempt_at TEXT NOT NULL,
  lease_token TEXT,
  lease_expires_at TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  provider_message_id TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  accepted_at TEXT,
  terminal_at TEXT,
  payload_purge_at TEXT,
  metadata_purge_at TEXT NOT NULL,
  UNIQUE (site_id, idempotency_key),
  FOREIGN KEY (connection_id) REFERENCES aria_email_connections(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_email_deliveries_due ON aria_email_deliveries(site_id, status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_created ON aria_email_deliveries(site_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_purpose ON aria_email_deliveries(site_id, purpose, created_at);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_connection ON aria_email_deliveries(site_id, connection_id, created_at);

CREATE TABLE IF NOT EXISTS aria_email_attempts (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL DEFAULT 'default',
  delivery_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'queued_by_provider', 'transient_failure', 'permanent_failure')),
  error_class TEXT CHECK (error_class IS NULL OR error_class IN ('validation', 'authentication', 'authorization', 'rate_limit', 'timeout', 'network', 'recipient', 'sender', 'provider', 'internal')),
  error_code TEXT,
  error_message TEXT,
  provider_message_id TEXT,
  provider_response_json TEXT,
  latency_ms INTEGER,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  UNIQUE (site_id, delivery_id, attempt_number),
  FOREIGN KEY (delivery_id) REFERENCES aria_email_deliveries(id) ON DELETE CASCADE,
  FOREIGN KEY (connection_id) REFERENCES aria_email_connections(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_attempts_delivery ON aria_email_attempts(site_id, delivery_id, attempt_number);
CREATE INDEX IF NOT EXISTS idx_email_attempts_outcome ON aria_email_attempts(site_id, outcome, finished_at);

-- ============================================================================
-- CMS: collections, entries, locales, relations, revisions, permissions
-- ============================================================================

CREATE TABLE IF NOT EXISTS aria_collections (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('content', 'data', 'config', 'tags')),
  schema_json TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'collection')),
  url_pattern TEXT,
  template_page_id TEXT,
  list_page_id TEXT,
  supports_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_aria_collections_kind ON aria_collections (kind);

CREATE TABLE IF NOT EXISTS aria_entries (
  id TEXT PRIMARY KEY NOT NULL,
  collection_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'scheduled', 'archived')),
  version TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  scheduled_for TEXT,
  created_by_id TEXT,
  created_by_username TEXT,
  created_by_email TEXT,
  updated_by_id TEXT,
  updated_by_username TEXT,
  updated_by_email TEXT,
  published_by_id TEXT,
  published_by_username TEXT,
  published_by_email TEXT,
  schedule_lease_token TEXT,
  schedule_lease_expires_at TEXT,
  schedule_attempt_count INTEGER NOT NULL DEFAULT 0,
  last_schedule_error TEXT,
  FOREIGN KEY (collection_id) REFERENCES aria_collections (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_aria_entries_collection_status_updated ON aria_entries (collection_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_aria_entries_collection_scheduled
  ON aria_entries (collection_id, scheduled_for)
  WHERE status = 'scheduled';

CREATE TABLE IF NOT EXISTS aria_entry_locales (
  entry_id TEXT NOT NULL,
  collection_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  frontmatter_json TEXT NOT NULL DEFAULT '{}',
  body TEXT,
  is_source INTEGER NOT NULL DEFAULT 0,
  translation_meta_json TEXT,
  comments_closed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (entry_id, locale),
  FOREIGN KEY (entry_id) REFERENCES aria_entries (id) ON DELETE CASCADE,
  FOREIGN KEY (collection_id) REFERENCES aria_collections (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_aria_entry_locales_collection_locale_slug ON aria_entry_locales (collection_id, locale, slug);
CREATE INDEX IF NOT EXISTS idx_aria_entry_locales_slug ON aria_entry_locales (collection_id, slug);

CREATE TABLE IF NOT EXISTS aria_entry_relations (
  source_entry_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  target_entry_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  meta_json TEXT,
  PRIMARY KEY (source_entry_id, field_key, target_entry_id),
  FOREIGN KEY (source_entry_id) REFERENCES aria_entries (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_aria_entry_relations_source_field_position ON aria_entry_relations (source_entry_id, field_key, position);
CREATE INDEX IF NOT EXISTS idx_aria_entry_relations_target_field ON aria_entry_relations (target_entry_id, field_key);

CREATE TABLE IF NOT EXISTS aria_entry_revisions (
  id TEXT PRIMARY KEY NOT NULL,
  entry_id TEXT NOT NULL,
  locale TEXT,
  version TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_username TEXT,
  actor_email TEXT,
  actor_avatar_url TEXT,
  message TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (entry_id) REFERENCES aria_entries (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_aria_entry_revisions_entry_created ON aria_entry_revisions (entry_id, created_at DESC);

CREATE TABLE IF NOT EXISTS aria_collection_permissions (
  principal_id TEXT NOT NULL,
  collection_id TEXT NOT NULL,
  action TEXT NOT NULL,
  PRIMARY KEY (principal_id, collection_id, action),
  FOREIGN KEY (collection_id) REFERENCES aria_collections (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS aria_collection_policies (
  collection_id TEXT PRIMARY KEY NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('inherit', 'restricted')) DEFAULT 'inherit',
  rules_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (collection_id) REFERENCES aria_collections (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_aria_collection_policies_mode
  ON aria_collection_policies (mode);

CREATE TABLE IF NOT EXISTS aria_cms_audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_username TEXT,
  collection_id TEXT,
  entry_id TEXT,
  summary TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_aria_cms_audit_events_collection_created
  ON aria_cms_audit_events (collection_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aria_cms_audit_events_entry_created
  ON aria_cms_audit_events (entry_id, created_at DESC);

CREATE TABLE IF NOT EXISTS aria_cms_search_documents (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('collection', 'entry')),
  entity_id TEXT NOT NULL,
  collection_id TEXT,
  locale TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT,
  collection_name TEXT,
  collection_label TEXT,
  status TEXT,
  searchable_text TEXT NOT NULL DEFAULT '',
  source_version TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  generation TEXT NOT NULL DEFAULT 'default',
  PRIMARY KEY (entity_type, entity_id, locale, generation)
);

CREATE INDEX IF NOT EXISTS idx_aria_cms_search_documents_locale_updated
  ON aria_cms_search_documents (locale, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_aria_cms_search_documents_collection
  ON aria_cms_search_documents (collection_id, locale);
CREATE INDEX IF NOT EXISTS idx_aria_cms_search_documents_scope_generation
  ON aria_cms_search_documents (collection_id, generation, locale);

CREATE TABLE IF NOT EXISTS aria_cms_search_scopes (
  collection_id TEXT PRIMARY KEY NOT NULL,
  active_generation TEXT NOT NULL DEFAULT 'default',
  pending_generation TEXT,
  updated_at TEXT NOT NULL
);

-- ============================================================================
-- MODERATED PUBLIC COMMENTS (dedicated UGC; never CMS entry mutations)
-- ============================================================================

CREATE TABLE IF NOT EXISTS aria_public_comments (
  id TEXT PRIMARY KEY NOT NULL,
  collection_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'spam', 'deleted')),
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  moderated_at TEXT,
  moderated_by_id TEXT,
  FOREIGN KEY (collection_id) REFERENCES aria_collections(id) ON DELETE CASCADE,
  FOREIGN KEY (entry_id) REFERENCES aria_entries(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_aria_public_comments_idempotency
  ON aria_public_comments(author_id, entry_id, locale, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_aria_public_comments_public
  ON aria_public_comments(entry_id, locale, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aria_public_comments_moderation
  ON aria_public_comments(collection_id, status, updated_at ASC);

CREATE TABLE IF NOT EXISTS aria_public_comment_moderation_events (
  id TEXT PRIMARY KEY NOT NULL,
  comment_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL CHECK (to_status IN ('pending', 'approved', 'rejected', 'spam', 'deleted')),
  actor_id TEXT NOT NULL,
  reason_code TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (comment_id) REFERENCES aria_public_comments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_aria_public_comment_moderation_events_comment
  ON aria_public_comment_moderation_events(comment_id, created_at ASC);

-- Durable, privacy-minimized submission reservations. They make the two
-- comment-rate limits enforceable at the storage boundary without retaining
-- network identifiers or comment text. Expired rows are pruned by maintenance.
CREATE TABLE IF NOT EXISTS aria_public_comment_rate_reservations (
  id TEXT PRIMARY KEY NOT NULL,
  author_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (entry_id) REFERENCES aria_entries(id) ON DELETE CASCADE,
  UNIQUE(author_id, entry_id, locale, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_aria_public_comment_rate_reservations_author
  ON aria_public_comment_rate_reservations(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aria_public_comment_rate_reservations_entry
  ON aria_public_comment_rate_reservations(entry_id, locale, created_at DESC);

-- ============================================================================
-- EDITORIAL WORKFLOW (Phase 16; separate from publication and public UGC)
-- ============================================================================

CREATE TABLE IF NOT EXISTS aria_cms_entry_autosaves (
  id TEXT PRIMARY KEY NOT NULL,
  entry_id TEXT NOT NULL,
  collection_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  base_version TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  client_sequence INTEGER NOT NULL CHECK (client_sequence >= 0),
  payload_json TEXT NOT NULL,
  checksum TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (entry_id) REFERENCES aria_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (collection_id) REFERENCES aria_collections(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_aria_cms_entry_autosaves_sequence
  ON aria_cms_entry_autosaves(entry_id, locale, actor_id, client_sequence);
CREATE INDEX IF NOT EXISTS idx_aria_cms_entry_autosaves_recovery
  ON aria_cms_entry_autosaves(entry_id, locale, actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aria_cms_entry_autosaves_expiry
  ON aria_cms_entry_autosaves(expires_at);

CREATE TABLE IF NOT EXISTS aria_cms_entry_presence_leases (
  entry_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  lease_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (entry_id, locale, actor_id),
  FOREIGN KEY (entry_id) REFERENCES aria_entries(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_aria_cms_entry_presence_active
  ON aria_cms_entry_presence_leases(entry_id, locale, expires_at);

CREATE TABLE IF NOT EXISTS aria_cms_entry_edit_locks (
  entry_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  lease_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (entry_id, locale),
  FOREIGN KEY (entry_id) REFERENCES aria_entries(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_aria_cms_entry_edit_locks_expiry
  ON aria_cms_entry_edit_locks(expires_at);

CREATE TABLE IF NOT EXISTS aria_cms_entry_workflow (
  entry_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('none', 'in_review', 'changes_requested', 'approved')) DEFAULT 'none',
  reviewed_version TEXT,
  assigned_to_id TEXT,
  updated_by_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (entry_id, locale),
  FOREIGN KEY (entry_id) REFERENCES aria_entries(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_aria_cms_entry_workflow_queue
  ON aria_cms_entry_workflow(state, updated_at ASC);

CREATE TABLE IF NOT EXISTS aria_cms_review_annotations (
  id TEXT PRIMARY KEY NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('entry', 'page', 'media', 'redirect', 'settings', 'design_system')),
  resource_id TEXT NOT NULL,
  collection_id TEXT,
  locale TEXT,
  field_path TEXT,
  anchor_json TEXT,
  fallback_label TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved')) DEFAULT 'open',
  author_id TEXT NOT NULL,
  resolved_by_id TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_aria_cms_review_annotations_resource
  ON aria_cms_review_annotations(resource_type, resource_id, locale, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_aria_cms_review_annotations_collection
  ON aria_cms_review_annotations(collection_id, status, updated_at DESC);

-- ============================================================================
-- PAGE ACCESS (password/private page sessions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS aria_page_access_sessions (
  token_hash TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  policy_version INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_aria_page_access_sessions_page_expires ON aria_page_access_sessions(page_id, expires_at);

-- ============================================================================
-- WORDPRESS IMPORT
-- ============================================================================

CREATE TABLE IF NOT EXISTS aria_wp_import_batches (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('wxr')),
  source_site_url TEXT,
  source_home_url TEXT,
  source_wp_version TEXT,
  table_prefix TEXT,
  multisite_blog_id TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('dry_run', 'apply')),
  status TEXT NOT NULL CHECK (status IN ('uploaded', 'analyzing', 'planned', 'applying', 'completed', 'failed', 'cancelled')),
  current_phase TEXT CHECK (
    current_phase IS NULL OR current_phase IN (
      'uploading', 'reading-source', 'detecting-settings', 'importing-users',
      'creating-collections', 'importing-posts', 'importing-pages',
      'importing-custom-post-types', 'importing-taxonomies', 'importing-media',
      'importing-comments', 'creating-menus', 'mapping-seo',
      'creating-redirects', 'finalizing-report', 'complete', 'failed'
    )
  ),
  current_message TEXT,
  progress_percent REAL NOT NULL DEFAULT 0,
  default_entry_status TEXT NOT NULL DEFAULT 'draft' CHECK (default_entry_status IN ('draft', 'published', 'archived')),
  media_mode TEXT NOT NULL DEFAULT 'download' CHECK (media_mode IN ('download', 'reference', 'skip')),
  counts_json TEXT NOT NULL DEFAULT '{}',
  summary_json TEXT NOT NULL DEFAULT '{}',
  error_message TEXT,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_aria_wp_import_batches_status_created ON aria_wp_import_batches(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aria_wp_import_batches_source_site_created ON aria_wp_import_batches(source_site_url, created_at DESC);

CREATE TABLE IF NOT EXISTS aria_wp_import_files (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  object_key TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  retention_expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (batch_id) REFERENCES aria_wp_import_batches(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_aria_wp_import_files_batch ON aria_wp_import_files(batch_id);
CREATE INDEX IF NOT EXISTS idx_aria_wp_import_files_retention ON aria_wp_import_files(retention_expires_at);

CREATE TABLE IF NOT EXISTS aria_wp_import_items (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_parent_id TEXT,
  source_label TEXT,
  target_type TEXT,
  target_id TEXT,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'skip', 'fail')),
  status TEXT NOT NULL CHECK (status IN ('planned', 'imported', 'skipped', 'failed')),
  source_checksum TEXT,
  skip_reason TEXT,
  diagnostics_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (batch_id) REFERENCES aria_wp_import_batches(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_aria_wp_import_items_batch_status ON aria_wp_import_items(batch_id, status);
CREATE INDEX IF NOT EXISTS idx_aria_wp_import_items_source ON aria_wp_import_items(batch_id, source_kind, source_id);
CREATE INDEX IF NOT EXISTS idx_aria_wp_import_items_target ON aria_wp_import_items(target_type, target_id);

CREATE TABLE IF NOT EXISTS aria_wp_import_mappings (
  id TEXT PRIMARY KEY,
  source_site_hash TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  source_checksum TEXT,
  last_batch_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_aria_wp_import_mappings_source ON aria_wp_import_mappings(source_site_hash, source_kind, source_id);

CREATE TABLE IF NOT EXISTS aria_wp_import_media (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  source_attachment_id TEXT,
  source_url TEXT NOT NULL,
  target_media_path TEXT,
  target_media_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('planned', 'downloaded', 'referenced', 'skipped', 'failed')),
  content_type TEXT,
  size_bytes INTEGER,
  sha256 TEXT,
  alt TEXT,
  caption TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (batch_id) REFERENCES aria_wp_import_batches(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_aria_wp_import_media_batch_status ON aria_wp_import_media(batch_id, status);
CREATE INDEX IF NOT EXISTS idx_aria_wp_import_media_attachment ON aria_wp_import_media(source_attachment_id);
CREATE INDEX IF NOT EXISTS idx_aria_wp_import_media_url ON aria_wp_import_media(source_url);

CREATE TABLE IF NOT EXISTS aria_wp_import_events (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (
    phase IN (
      'uploading', 'reading-source', 'detecting-settings', 'importing-users',
      'creating-collections', 'importing-posts', 'importing-pages',
      'importing-custom-post-types', 'importing-taxonomies', 'importing-media',
      'importing-comments', 'creating-menus', 'mapping-seo',
      'creating-redirects', 'finalizing-report', 'complete', 'failed'
    )
  ),
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  message TEXT NOT NULL,
  completed_count INTEGER,
  total_count INTEGER,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (batch_id) REFERENCES aria_wp_import_batches(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_aria_wp_import_events_batch_created ON aria_wp_import_events(batch_id, created_at ASC);
