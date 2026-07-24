# Aria storage

This directory holds the **local persistence surface** for a site: the SQLite database, optional JSON seed fixtures, published snapshot caches, exports, and generated SQL helpers. Runtime reads and writes go through the **`StorageAdapter`** in `aria/lib/storage/` — not by editing files by hand during normal Studio use.

## Directory layout

```text
aria/storage/
├── aria.db              # Canonical local site database (libSQL/SQLite)
├── dsl/                 # Starter seeds & fixtures (not runtime source of truth)
│   ├── components/
│   ├── layouts/
│   └── pages/
├── snapshots/           # Legacy HTML files (optional); live snapshots live in DB
├── thumbnails/          # Legacy on-disk thumbs; new thumbs use aria_thumbnails in DB
├── exports/             # Site export ZIPs (local dev; R2 in production)
├── generated/           # Generated SQL snapshots (seeding, bootstrap)
└── slug-index.json      # Legacy slug map (prefer DB meta; see slugIndex.ts)
```

`aria.db` is created on first boot when you run `npm run dev`. Auth, builder content, media metadata, content-sync state, and thumbnails (blobs) all share this file locally.

## Canonical data: `aria.db`

Builder content is stored as **versioned DSL JSON** in SQLite tables, plus meta rows for inventory, ordering, settings, and publishing.

| Area | Tables (representative) |
| ---- | ----------------------- |
| Pages | `aria_page_versions`, `aria_page_meta` |
| Layouts | `aria_layout_versions`, `aria_layout_meta` |
| Components | `aria_component_versions`, `aria_component_meta` |
| Design system | `aria_styles` (segmented universal design system rows) |
| Site settings | `aria_site_settings` |
| Studio ordering | `aria_order` (`pages` / `layouts` / `components`) |
| Published HTML cache | `aria_snapshots` (`draft` and `published` stages) |
| Page sync metadata | `aria_page_metadata` |
| Thumbnails | `aria_thumbnails` |
| Media catalog | `aria_media_*` |
| Content sync jobs | `aria_content_sync_*`, `aria_content_site_state` |
| Auth (local) | `aria_users`, `aria_sessions`, `aria_config`, … |

**Agent BYOK API keys** are encrypted in `aria_config` (`agent_byok_master_key`, `agent_credentials_*`). Provider toggles and model lists live in `aria_site_settings.agent`. Content sync moves site settings only. Do not export or import auth/session rows for normal OSS deployments; create the first production administrator through `/admin/setup`.

Schema changes ship as forward-numbered SQL in `aria/migrations/`. The idempotent `0001_baseline_schema.sql` is applied history and must not be edited for new schema changes. Add the next ordered, forward-only migration instead. **Local SQLite** tracks and applies each file through [`runPendingStorageMigrations()`](../lib/storage/runStorageMigrations.ts). **Remote D1** applies the same files via Wrangler (`migrations_dir = "aria/migrations"` in `wrangler.toml`). New installs get a clean slate seeded from `aria/lib/storage/starterContent.ts`; there is no runtime healing of pre-baseline (unprefixed `page_dsl_*` era) schemas.

## Storage backends

Selection is handled by `getStorageAdapterAsync()` (`aria/lib/storage/getStorageAdapter.ts`).

| Mode | When | Backend |
| ---- | ---- | ------- |
| Local dev (default) | `npm run dev` (Node) | `SQLiteStorageAdapter` → `aria/storage/aria.db` |
| Edge / production | `npm run dev:edge`, deploy, Workers | `CloudflareStorageAdapter` → D1 (`aria_db`), KV (`aria_cache`), R2 (`aria_r2`) |

Environment hints:

- `ARIA_STORAGE_BACKEND=sqlite` or `local-sqlite` — force local SQLite (not valid under Astro 6 Cloudflare/workerd dev).
- `ARIA_STORAGE_BACKEND=cloudflare` or `ARIA_FORCE_CLOUDFLARE=1` — prefer Cloudflare bindings when present.

Interface contract: `aria/lib/storage/adapter.ts`. Implementations: `sqlite.ts`, `cloudflare.ts`.

## Filesystem paths (besides the DB)

| Path | Role |
| ---- | ---- |
| `public/uploads/` | Local media bytes (referenced from `aria_media_*` rows) |
| `aria/storage/snapshots/*.html` | Old on-disk snapshot HTML; **current** snapshots are in `aria_snapshots` |
| `aria/storage/thumbnails/` | Directory ensured by adapter; prefer DB blobs (`aria_thumbnails`) |
| `aria/storage/exports/` | Local site-export artifacts (`ARIA_EXPORTS_LOCAL_DIR` overrides) |
| `aria/storage/generated/` | Scripts output, gitignored & safe to delete (`seed-remote-bootstrap.sql` from `db:seed`, `seed-canonical-storage.sql`, auth bootstrap SQL) |

## `dsl/` — seeds and fixtures only

`aria/storage/dsl/` is **not** the live store. It supplies:

- **Starter content** on empty DB (`starterPages.ts`, `starterLayouts.ts` read `meta.json` + `v{version}.json` under each slug folder).
- **Test/fixture output** (`aria/tests/seedTestData.ts`).
- **Optional import sources** for scripts (e.g. `seed-d1-storage.ts`).

Typical layout per resource:

```text
dsl/pages/{slug}/
├── meta.json
└── v{timestamp}.json
```

Some slugs also have a flat `{slug}.json` at the parent level from older exports. After the DB is populated, Studio edits `aria.db` (or remote D1), not these files.

## Server access (no `/api/storage`)

Storage mutations run through **Astro Actions** (`aria/actions/*`, exported from `src/actions/index.ts`), for example:

- `crud`, `pages`, `save`, `nodes` — page/layout/component DSL
- `publishing` — snapshots and publish flow
- `styles`, `designSystem` — design system and tokens
- `ordering` — resource order
- `contentSync` — local ↔ remote promotion with conflict policies
- `storage` — version-history maintenance
- `siteExport`, `importExport` — exports

Always call `getStorageAdapterAsync(context.locals)` inside action handlers; do not bypass the adapter for product features.

## Promoting content between environments

| Command | Purpose |
| ------- | ------- |
| `npm run dev` | Edit against local `aria.db` |
| `npm run dev:edge` | Cloudflare bindings backed by local Miniflare; applies local D1 migrations and starts without automatically seeding content |
| `npm run push:remote` | Copy local DB **content** → remote D1 |
| `npm run push:remote-media` | Content + `public/uploads` → D1 + R2 |
| `npm run push:local` / `push:local-media` | Local `aria.db` → wrangler **local** D1/R2 |
| Studio **content sync** | Day-to-day sync with plan/apply and conflict handling |

See the root [README.md](../../README.md) for deploy vs content push and token setup.

Maintenance scripts:

- `npm run storage:reset-local` — delete `aria.db`; next boot recreates and re-seeds starters.
- `npm run storage:slim-local` — prune old versions in local DB (dry-run variant available).

## Development watcher

The Aria integration ignores heavy storage paths during Vite watch so saves do not reload the dev server constantly (`aria/integration.ts`): `dsl/`, `snapshots/`, legacy `pages/` / `components/` / `layouts/` paths, etc.

## Guidelines

1. **Do not treat `dsl/*.json` as source of truth** after the site has a database — edit in Studio or migrate via adapter/scripts.
2. **Do not add JSON content under `aria/api/`** — that tree is not used for storage (actions + adapter only).
3. **Use the adapter** for new persistence features; extend `adapter.ts` and both SQLite and Cloudflare implementations when needed.
4. **Back up `aria.db`** before destructive scripts; `.bak-*` files in this folder are manual backups, not managed by the app.
5. **Auth on production** — create users on the live site; avoid pushing auth from local unless you understand `--with-auth` and `I_UNDERSTAND_AUTH_PUSH=1`.
6. **Migrations move forward** - never revise an applied migration; add the next
   numbered file and verify it against both SQLite and D1.

## Related code

- `aria/lib/storage/adapter.ts` — storage contract
- `aria/lib/storage/getStorageAdapter.ts` — backend selection
- `aria/migrations/` — schema migrations (local + D1)
- `aria/actions/` — Astro Actions surface
- `aria/scripts/push-remote-content.ts` — CLI content promotion
