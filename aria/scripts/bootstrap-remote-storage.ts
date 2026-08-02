/**
 * Explicit starter-content bootstrap for a fresh remote (Cloudflare D1) site.
 * First-launch onboarding is the normal way to choose a blank.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

import {
  loadStarterLayouts,
  type StarterLayoutSeed,
} from "../lib/storage/starterLayouts";
import { loadStarterPage } from "../lib/storage/starterPages";
import {
  AUTHORS_COLLECTION_NAME,
  TAGS_COLLECTION_NAME,
  buildAriaCollection,
  buildBlogEntryTemplatePage,
  buildBlogListPage,
  buildTagArchiveTemplatePage,
  buildNotFoundPage,
  buildStarterCollectionDefinitions,
  buildStarterDesignSystem,
  buildStarterSiteSettings,
} from "../lib/storage/starterContent";
import { buildStarterMainNavCollectionDefinition } from "../lib/storage/starterMainNav";
import { buildStarterCmsEntryRecords } from "../lib/storage/starterCmsEntries";
import { serializeDslForStorage } from "../lib/storage/helpers";
import { prepareNormalizedSurfaceVersion } from "../lib/storage/internal/domains/surfaceNormalization";
import { serializeStoredDesignSystemRows } from "../lib/storage/designSystemRows";
import {
  collectionToRow,
  entryLocaleToRow,
  entryRelationToRow,
  entryToRow,
} from "../lib/cms/storage/db";
import {
  buildCurrentCompilerMetadata,
  serializeCompilerMetadata,
} from "../lib/system/metadata";
import type { AriaEntryRecord } from "../lib/cms/schemas";
import type {
  StoredPageAccessMode,
  StoredPageSystemRole,
} from "../lib/storage/adapter";
import { resolveWranglerConfigPath } from "../lib/storage/wrangler-config";
import type { PageDSL } from "../lib/types/nodes";
import type { AriaCollection } from "../lib/cms/schemas";
import { isMainModule } from "./lib/node-command";
import { runWranglerSync } from "./lib/wrangler-command";

const GENERATED_SQL_DIR = resolve(process.cwd(), "aria/storage/generated");
const OUTPUT_SQL = resolve(GENERATED_SQL_DIR, "seed-remote-bootstrap.sql");

export const INITIAL_SEED_CHECK_SQL = `
  SELECT CASE WHEN
    EXISTS (SELECT 1 FROM aria_page_meta LIMIT 1)
    OR EXISTS (SELECT 1 FROM aria_collections LIMIT 1)
    OR EXISTS (SELECT 1 FROM aria_entries LIMIT 1)
    OR EXISTS (SELECT 1 FROM aria_site_settings LIMIT 1)
  THEN 0 ELSE 1 END AS is_empty
`;

/** Returns whether a parsed value is a non-null object record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Parses Wrangler's `d1 execute --json` result and refuses ambiguous output. */
export function isRemoteDatabaseEmpty(json: string): boolean {
  const parsed: unknown = JSON.parse(json);
  const batches = Array.isArray(parsed) ? parsed : [parsed];
  const rows = batches.flatMap(
    /** Collects result rows from valid Wrangler response batches. */
    (batch) =>
      isRecord(batch) && Array.isArray(batch.results) ? batch.results : [],
  );

  if (rows.length !== 1 || !isRecord(rows[0])) {
    throw new Error("Could not determine whether remote D1 storage is empty");
  }

  const value = rows[0].is_empty;
  if (value === 1 || value === "1" || value === true) {
    return true;
  }
  if (value === 0 || value === "0" || value === false) {
    return false;
  }

  throw new Error(
    "Remote D1 storage emptiness check returned an invalid value",
  );
}

/** Serializes a bootstrap value as an escaped SQL literal. */
function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }

  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Collects parameterized statements into literal SQL text, since `wrangler d1 execute --file` has no parameter binding. */
class SqlBuffer {
  private statements: string[] = [];

  /** Interpolates escaped values into a parameterized SQL statement. */
  private interpolate(sql: string, args: readonly unknown[] = []): string {
    let index = 0;
    return sql.replace(
      /\?/g,
      /** Replaces each placeholder with its escaped bootstrap value. */
      () => sqlLiteral(args[index++]),
    );
  }

  /** Appends a parameterized statement terminated by a semicolon. */
  append(sql: string, args: readonly unknown[] = []): void {
    this.statements.push(`${this.interpolate(sql, args)};`);
  }

  /** Appends literal SQL while ensuring it ends with a semicolon. */
  appendRaw(sql: string): void {
    this.statements.push(sql.endsWith(";") ? sql : `${sql};`);
  }

  /** Joins buffered statements into executable SQL text. */
  toSql(): string {
    return this.statements.join("\n");
  }
}

/** Resolves a collection id at execution time so bootstrap works with existing UUID-backed rows. */
function collectionIdByNameSql(collectionName: string): string {
  return `(SELECT id FROM aria_collections WHERE name = ${sqlLiteral(collectionName)} LIMIT 1)`;
}

/** Appends SQL for one collection and its configured fields. */
function appendCollectionInsert(
  buffer: SqlBuffer,
  collection: AriaCollection,
): void {
  const row = collectionToRow(collection);
  buffer.append(
    `INSERT INTO aria_collections (
      id, name, label, kind, schema_json, scope,
      url_pattern, template_page_id, list_page_id, supports_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      label = excluded.label,
      kind = excluded.kind,
      schema_json = excluded.schema_json,
      scope = excluded.scope,
      url_pattern = excluded.url_pattern,
      template_page_id = excluded.template_page_id,
      list_page_id = excluded.list_page_id,
      supports_json = excluded.supports_json,
      updated_at = excluded.updated_at`,
    [
      row.id,
      row.name,
      row.label,
      row.kind,
      row.schema_json,
      row.scope,
      row.url_pattern,
      row.template_page_id,
      row.list_page_id,
      row.supports_json,
      row.created_at,
      row.updated_at,
    ],
  );
}

/** Appends starter layout records and their serialized design data. */
async function appendStarterLayouts(
  buffer: SqlBuffer,
  layouts: StarterLayoutSeed[],
): Promise<void> {
  for (const layout of layouts) {
    const prepared = await prepareNormalizedSurfaceVersion({
      kind: "layout",
      source: layout.dsl,
      version: layout.version,
      updatedAt: layout.updatedAt,
    });
    buffer.append(
      `INSERT OR IGNORE INTO aria_layout_versions (id, version, name, status, dsl_json, content_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        layout.id,
        layout.version,
        layout.name,
        "published",
        serializeDslForStorage(prepared.source),
        prepared.sourceHash,
        layout.updatedAt,
      ],
    );
    buffer.append(
      `INSERT OR IGNORE INTO aria_layout_meta (id, name, description, status, current_version, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        layout.id,
        layout.name,
        layout.description,
        "published",
        layout.version,
        layout.updatedAt,
      ],
    );
  }
}

/** Appends one generated system page to the bootstrap SQL buffer. */
async function appendSystemPage(
  buffer: SqlBuffer,
  page: PageDSL,
  options: {
    systemRole: StoredPageSystemRole;
    accessMode: StoredPageAccessMode;
  },
  now: string,
): Promise<void> {
  const version = "v1";
  const prepared = await prepareNormalizedSurfaceVersion({
    kind: "page",
    source: page,
    version,
    updatedAt: now,
  });

  buffer.append(
    `INSERT OR IGNORE INTO aria_page_versions (id, version, slug, title, status, dsl_json, content_hash, created_at, compiler_metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      page.id,
      version,
      page.slug,
      page.title,
      "published",
      serializeDslForStorage(prepared.source),
      prepared.sourceHash,
      now,
      serializeCompilerMetadata(buildCurrentCompilerMetadata(now)),
    ],
  );

  buffer.append(
    `INSERT OR IGNORE INTO aria_page_meta (
       id, slug, title, status, layout, draft_version, published_version, current_version,
       system_role, access_mode, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      page.id,
      page.slug,
      page.title,
      "published",
      page.layout ?? null,
      version,
      version,
      version,
      options.systemRole,
      options.accessMode,
      now,
    ],
  );
}

/** Appends the starter home page statements to the bootstrap buffer. */
async function appendHomePage(buffer: SqlBuffer): Promise<void> {
  const starterPage = await loadStarterPage();
  const prepared = await prepareNormalizedSurfaceVersion({
    kind: "page",
    source: starterPage.dsl,
    version: starterPage.version,
    updatedAt: starterPage.updatedAt,
  });
  buffer.append(
    `INSERT OR IGNORE INTO aria_page_versions (id, version, slug, title, status, dsl_json, content_hash, created_at, compiler_metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      starterPage.id,
      starterPage.version,
      starterPage.slug,
      starterPage.title,
      starterPage.status,
      serializeDslForStorage(prepared.source),
      prepared.sourceHash,
      starterPage.updatedAt,
      serializeCompilerMetadata(
        buildCurrentCompilerMetadata(starterPage.updatedAt),
      ),
    ],
  );
  buffer.append(
    `INSERT OR IGNORE INTO aria_page_meta (id, slug, title, status, layout, draft_version, published_version, current_version, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      starterPage.id,
      starterPage.slug,
      starterPage.title,
      starterPage.status,
      starterPage.layout,
      starterPage.version,
      starterPage.status === "published" ? starterPage.version : null,
      starterPage.version,
      starterPage.updatedAt,
    ],
  );
}

/** Appends the starter navigation collection to the bootstrap buffer. */
function appendStarterMainNavCollection(buffer: SqlBuffer, now: string): void {
  const mainNavDefinition = buildStarterMainNavCollectionDefinition();
  const mainNavCollection = buildAriaCollection(mainNavDefinition, now);
  appendCollectionInsert(buffer, mainNavCollection);
}

/** Appends one starter CMS entry and its field values. */
function appendStarterCmsEntryRecord(
  buffer: SqlBuffer,
  record: AriaEntryRecord,
): void {
  const entryRow = entryToRow(record.entry);
  const collectionName = record.entry.collectionId;
  const collectionIdSql = collectionIdByNameSql(collectionName);

  buffer.appendRaw(
    `INSERT OR IGNORE INTO aria_entries (
      id, collection_id, status, version, author_id,
      created_at, updated_at, published_at, scheduled_for
    ) VALUES (${sqlLiteral(entryRow.id)}, ${collectionIdSql}, ${sqlLiteral(entryRow.status)}, ${sqlLiteral(entryRow.version)}, ${sqlLiteral(entryRow.author_id)}, ${sqlLiteral(entryRow.created_at)}, ${sqlLiteral(entryRow.updated_at)}, ${sqlLiteral(entryRow.published_at)}, ${sqlLiteral(entryRow.scheduled_for)})`,
  );

  for (const locale of record.locales) {
    const localeRow = entryLocaleToRow(locale);
    buffer.appendRaw(
      `INSERT OR IGNORE INTO aria_entry_locales (
        entry_id, collection_id, locale, slug, title,
        frontmatter_json, body, is_source
      ) VALUES (${sqlLiteral(localeRow.entry_id)}, ${collectionIdSql}, ${sqlLiteral(localeRow.locale)}, ${sqlLiteral(localeRow.slug)}, ${sqlLiteral(localeRow.title)}, ${sqlLiteral(localeRow.frontmatter_json)}, ${sqlLiteral(localeRow.body)}, ${sqlLiteral(localeRow.is_source)})`,
    );
  }

  for (const relation of record.relations ?? []) {
    const relationRow = entryRelationToRow(relation);
    buffer.append(
      `INSERT OR IGNORE INTO aria_entry_relations (
        source_entry_id, field_key, target_entry_id, position, meta_json
      ) VALUES (?, ?, ?, ?, ?)`,
      [
        relationRow.source_entry_id,
        relationRow.field_key,
        relationRow.target_entry_id,
        relationRow.position,
        relationRow.meta_json,
      ],
    );
  }
}

/** Appends every starter CMS entry to the bootstrap SQL. */
function appendStarterCmsEntryInserts(buffer: SqlBuffer, now: string): void {
  for (const record of buildStarterCmsEntryRecords(now)) {
    appendStarterCmsEntryRecord(buffer, record);
  }
}

/** Appends starter CMS collections, fields, entries, and system pages. */
async function appendStarterCms(buffer: SqlBuffer, now: string): Promise<void> {
  const { tags, authors } = buildStarterCollectionDefinitions({
    collectionIdByName: {},
  });
  const tagsCollection = buildAriaCollection(tags, now);
  const authorsCollection = buildAriaCollection(authors, now);
  appendCollectionInsert(buffer, tagsCollection);
  appendCollectionInsert(buffer, authorsCollection);

  const { blog } = buildStarterCollectionDefinitions({
    collectionIdByName: {
      [TAGS_COLLECTION_NAME]: tagsCollection.id,
      [AUTHORS_COLLECTION_NAME]: authorsCollection.id,
    },
  });
  const blogCollection = buildAriaCollection(blog, now);
  appendCollectionInsert(buffer, blogCollection);

  appendStarterMainNavCollection(buffer, now);
  appendStarterCmsEntryInserts(buffer, now);

  await appendSystemPage(
    buffer,
    buildBlogListPage(),
    { systemRole: "cms-collection", accessMode: "public" },
    now,
  );
  await appendSystemPage(
    buffer,
    buildBlogEntryTemplatePage(),
    { systemRole: "cms-entry", accessMode: "public" },
    now,
  );
  await appendSystemPage(
    buffer,
    buildTagArchiveTemplatePage(),
    { systemRole: "cms-entry", accessMode: "public" },
    now,
  );
}

/** Appends starter design-system records. */
function appendStarterDesign(buffer: SqlBuffer, now: string): void {
  const rows = serializeStoredDesignSystemRows(buildStarterDesignSystem(), now);
  for (const row of rows) {
    buffer.append(
      `INSERT OR IGNORE INTO aria_styles (id, styles_json, updated_at) VALUES (?, ?, ?)`,
      [row.id, row.stylesJson, row.updatedAt],
    );
  }
}

/** Appends the initial site settings record. */
function appendStarterSiteSettings(buffer: SqlBuffer, now: string): void {
  buffer.append(
    `INSERT OR IGNORE INTO aria_site_settings (id, settings_json, updated_at) VALUES (?, ?, ?)`,
    ["default", JSON.stringify(buildStarterSiteSettings()), now],
  );
}

/** Reads a named variable from the Wrangler TOML vars section. */
function extractVarValueFromWranglerToml(
  contents: string,
  key: string,
): string | null {
  const varsSectionMatch = contents.match(
    /(^|\n)\[vars\]\n([\s\S]*?)(\n\[[^\]]+\]|$)/,
  );
  if (!varsSectionMatch) {
    return null;
  }

  const varsSection = varsSectionMatch[2];
  const keyPattern = new RegExp(`^${key}\\s*=\\s*["']([^"']+)["']\\s*$`, "m");
  const match = varsSection.match(keyPattern);
  return match?.[1] ?? null;
}

/** Builds the site claim URL when a valid site URL is available. */
export function buildClaimUrl(siteUrl: unknown): string | null {
  if (typeof siteUrl !== "string") {
    return null;
  }

  const trimmed = siteUrl.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    url.pathname = "/admin/setup";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/** Reads an optional site URL from the bootstrap command arguments. */
function getCliSiteUrl(argv: string[] = process.argv.slice(2)): string | null {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith("--site-url=")) {
      return arg.slice("--site-url=".length);
    }

    if (arg === "--site-url") {
      return argv[index + 1] ?? null;
    }
  }

  return null;
}

/** Resolves the site URL from CLI, environment, and Wrangler configuration. */
export function resolveSiteUrl(
  options: {
    argv?: string[];
    env?: NodeJS.ProcessEnv;
    baseDir?: string;
    wranglerTomlPath?: string;
  } = {},
): string | null {
  const {
    argv = process.argv.slice(2),
    env = process.env,
    baseDir = process.cwd(),
    wranglerTomlPath = resolve(baseDir, "wrangler.toml"),
  } = options;

  const candidates = [
    getCliSiteUrl(argv),
    env.ARIA_SITE_URL,
    env.SITE_URL,
    env.CF_PAGES_URL,
    env.DEPLOYMENT_URL,
    env.URL,
  ];

  for (const candidate of candidates) {
    const claimUrl = buildClaimUrl(candidate);
    if (claimUrl) {
      return claimUrl;
    }
  }

  if (!existsSync(wranglerTomlPath)) {
    return null;
  }

  try {
    const wranglerToml = readFileSync(wranglerTomlPath, "utf-8");
    const configuredSiteUrl =
      extractVarValueFromWranglerToml(wranglerToml, "ARIA_SITE_URL") ??
      extractVarValueFromWranglerToml(wranglerToml, "SITE_URL") ??
      extractVarValueFromWranglerToml(wranglerToml, "CF_PAGES_URL");

    return buildClaimUrl(configuredSiteUrl);
  } catch {
    return null;
  }
}

/** Builds the SQL used to seed a fresh remote Aria database. */
export async function buildBootstrapSql(): Promise<string> {
  const now = new Date().toISOString();
  const buffer = new SqlBuffer();

  await appendStarterLayouts(buffer, await loadStarterLayouts());
  await appendHomePage(buffer);
  await appendSystemPage(
    buffer,
    buildNotFoundPage(),
    { systemRole: "not-found", accessMode: "public" },
    now,
  );
  await appendStarterCms(buffer, now);
  appendStarterDesign(buffer, now);
  appendStarterSiteSettings(buffer, now);

  return [
    `-- Aria canonical remote bootstrap`,
    `-- Generated: ${now}`,
    ``,
    `PRAGMA foreign_keys = OFF;`,
    ``,
    buffer.toSql(),
    ``,
    `PRAGMA foreign_keys = ON;`,
    ``,
  ].join("\n");
}

/** Builds SQL that inserts starter CMS entries without other bootstrap data. */
export async function buildStarterCmsEntriesOnlySql(): Promise<string> {
  const now = new Date().toISOString();
  const buffer = new SqlBuffer();
  appendStarterCmsEntryInserts(buffer, now);
  return [
    `-- Aria starter CMS entries incremental seed`,
    `-- Generated: ${now}`,
    ``,
    buffer.toSql(),
    ``,
  ].join("\n");
}

/** Builds and applies the selected remote bootstrap operation. */
async function main() {
  const databaseBinding = process.env.ARIA_D1_BINDING || "aria_db";
  const local = process.argv.includes("--local");
  const target = local ? "--local" : "--remote";
  const claimUrl = resolveSiteUrl();
  const configPath = resolveWranglerConfigPath();
  const configArgs = configPath ? ["--config", configPath] : [];
  const seedCheck = runWranglerSync(
    [
      "d1",
      "execute",
      databaseBinding,
      target,
      "--command",
      INITIAL_SEED_CHECK_SQL,
      "--json",
      ...configArgs,
    ],
    {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).stdout;

  if (!isRemoteDatabaseEmpty(seedCheck)) {
    console.log(
      "ℹ Remote D1 already contains site data; starter seed skipped.",
    );
    return;
  }

  mkdirSync(GENERATED_SQL_DIR, { recursive: true });
  const sql = await buildBootstrapSql();
  writeFileSync(OUTPUT_SQL, sql, "utf-8");

  console.log(
    `🔄 Bootstrapping ${local ? "local" : "remote"} Aria storage...\n`,
  );
  console.log(
    "✓ Starter layouts, home/404 pages, blog/authors/tags collections, and color palette prepared",
  );
  console.log(`📝 Written to: ${OUTPUT_SQL}\n`);

  runWranglerSync(
    [
      "d1",
      "execute",
      databaseBinding,
      target,
      `--file=${OUTPUT_SQL}`,
      ...configArgs,
    ],
    { stdio: "inherit" },
  );

  console.log(
    `\n✅ ${local ? "Local" : "Remote"} Aria bootstrap applied successfully!`,
  );
  if (claimUrl) {
    console.log(`🔐 Claim the first admin account at: ${claimUrl}`);
  } else {
    console.log(
      "🔐 Claim the first admin account by visiting /admin/setup on the deployed site.",
    );
  }
}

if (isMainModule(import.meta.url)) {
  await main();
}
