import type { Client, InValue } from "@libsql/client";
import { createClient } from "@libsql/client/node";
import fs from "fs/promises";
import path from "path";
import { z } from "zod";

import {
  applyAuthorshipBackfill,
  applyAuthorshipColumnMigrations,
  type AuthorshipColumnName,
  type AuthorshipTableName,
} from "../authorship/schemaMigrations";
import {
  appendSqlFragment,
  buildDesignSystemRowInsertAuthorship,
  buildSingletonUpsertAuthorshipAssignments,
  parseOptionalAuthorshipSaveContext,
  type ActorSqlBindings,
} from "../authorship/stamping";
import { type CmsStorageExecutor } from "../cms/storage";
import type { CacheInvalidationJob } from "../localization/siteTranslationSchemas";
import { CacheInvalidationJobSchema } from "../localization/siteTranslationSchemas";
import {
  MediaCatalogRepository,
  type MediaCatalogStorageExecutor,
} from "../media/catalog/repository";
import { type MediaUsageStorageExecutor } from "../media/catalog/usage";
import { type MediaTransformStorageExecutor } from "../media/transforms/storage";
import { createStoredMediaFilename } from "../media/utils/filename";
import { normalizeMediaKey } from "../media/utils/key";
import {
  isHiddenMediaPath,
  isListableMediaPath,
} from "../media/utils/visibility";
import {
  migratePageDSL,
  stripLegacyClassFields,
} from "../migrations/propMigrations";
import { normalizeSnapshotHtml } from "../rendering/normalizeSnapshotHtml";
import {
  buildPageThumbnailAdminUrl,
  PageThumbnailMimeTypeSchema,
} from "../rendering/pageThumbnails";
import { validatePageDSL } from "../schemas/nodes";
import {
  UniversalDesignSystemSchema,
  type UniversalDesignSystem,
} from "../styles/universalDesignSystem";
import {
  buildCurrentCompilerMetadata,
  serializeCompilerMetadata,
} from "../system/metadata";
import type { PageDSL } from "../types/nodes";
import { log } from "../utils/logger";
import { WORDPRESS_IMPORT_STORAGE_STATEMENTS } from "../wordpress-import/storage";
import type {
  AdapterInfo,
  AdapterMetrics,
  AuthorshipSaveContext,
  SiteSettings,
  StorageAdapter,
  StoredMediaUsageKind,
  StoredPageAccessMode,
  StoredPageSystemRole,
} from "./adapter";
import {
  normalizeSiteSettings,
  PagePublicationDependenciesSchema,
  serializeSiteSettingsForStorage,
} from "./adapter";
import { AdapterMetricsSchema } from "./adapterMetricsSchemas";
import {
  createDesignSystemSegmentId,
  DESIGN_SYSTEM_ROW_ID_LIKE_PATTERN,
  LEGACY_DESIGN_SYSTEM_ROW_ID,
  parseStoredDesignSystemRows,
  parseStoredDesignSystemSegments,
  serializeStoredDesignSystemRows,
} from "./designSystemRows";
import { prepareMediaBufferSave, serializeDslForStorage } from "./helpers";
import {
  createAssetOrderStorageDomain,
  type AssetOrderStorageDomain,
} from "./internal/domains/assetOrder";
import {
  createCmsStorageDomain,
  type CmsStorageDomain,
} from "./internal/domains/cms";
import {
  createContentStateStorageDomain,
  type ContentStateStorageDomain,
} from "./internal/domains/contentState";
import {
  createRateLimitStorageDomain,
  type RateLimitStorageDomain,
} from "./internal/domains/rateLimits";
import {
  createDslAssetStorageDomain,
  type DslAssetStorageDomain,
} from "./internal/domains/dslAssets";
import {
  createLocalizationStorageDomain,
  type LocalizationStorageDomain,
} from "./internal/domains/localization";
import {
  createMediaCatalogStorageDomain,
  type MediaCatalogStorageDomain,
} from "./internal/domains/mediaCatalog";
import {
  createPageAccessStorageDomain,
  type PageAccessStorageDomain,
} from "./internal/domains/pageAccess";
import {
  createPageLifecycleStorageDomain,
  type PageLifecycleStorageDomain,
} from "./internal/domains/pageLifecycle";
import {
  createPageMetadataStorageDomain,
  type PageMetadataStorageDomain,
} from "./internal/domains/pageMetadata";
import {
  createPageReadStorageDomain,
  type PageReadStorageDomain,
} from "./internal/domains/pageReads";
import {
  createRedirectStorageDomain,
  type RedirectStorageDomain,
} from "./internal/domains/redirects";
import {
  createWordPressImportStorageDomain,
  type WordPressImportStorageDomain,
} from "./internal/domains/wordpressImport";
import { ensurePageMetaSystemRoleConstraint } from "./pageMetaSystemRoleMigration";
import { runPendingStorageMigrations } from "./runStorageMigrations";
import {
  cacheInvalidationInsert,
  type LocalizationStorageExecutor,
} from "./siteLocalizationStorage";
import {
  seedStarterBlogCollectionsIfMissing,
  seedStarterCmsEntriesIfMissing,
} from "./starterCmsEntries";
import {
  buildBlogEntryTemplatePage,
  buildBlogListPage,
  buildNotFoundPage,
  buildStarterDesignSystem,
  buildStarterSiteSettings,
  buildTagArchiveTemplatePage,
  NOT_FOUND_PAGE_ID,
} from "./starterContent";
import { loadStarterLayouts } from "./starterLayouts";
import { seedStarterMainNavCollectionIfMissing } from "./starterMainNav";
import { loadStarterPage } from "./starterPages";
import {
  computeVersionContentHash,
  ContentHashSchema,
  DEFAULT_RECENT_VERSION_LIMIT,
} from "./versioning";

type SqlRow = Record<string, unknown>;
// This adapter uses positional SQL bindings exclusively. `InArgs` also allows
// named-record bindings, which leaks an impossible shape into domain contexts.
type SqlArgs = InValue[];

function asSqlArgs(values: readonly unknown[]): SqlArgs {
  return [...values] as SqlArgs;
}
const HOME_PAGE_SLUG = "index";

const StoredThumbnailKindSchema = z.enum(["page", "component", "layout"]);
const StoredThumbnailStageSchema = z.enum(["default", "draft", "published"]);
const StoredThumbnailRowSchema = z
  .object({
    kind: StoredThumbnailKindSchema,
    ref_id: z.string().trim().min(1),
    stage: StoredThumbnailStageSchema,
    content_type: PageThumbnailMimeTypeSchema,
    size_bytes: z.coerce.number().int().nonnegative(),
    image_blob: z.unknown(),
    updated_at: z.string().trim().min(1),
  })
  .strict();

type StoredThumbnailKind = z.infer<typeof StoredThumbnailKindSchema>;
type StoredThumbnailStage = z.infer<typeof StoredThumbnailStageSchema>;
type StoredThumbnailContentType = z.infer<typeof PageThumbnailMimeTypeSchema>;
type StoredThumbnailRow = z.infer<typeof StoredThumbnailRowSchema>;

function resolveStoredThumbnailContentType(
  rawContentType: unknown,
): StoredThumbnailContentType {
  const parsed = PageThumbnailMimeTypeSchema.safeParse(rawContentType);
  return parsed.success ? parsed.data : "image/webp";
}

function toStoredThumbnailBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }

  if (Object.prototype.toString.call(value) === "[object ArrayBuffer]") {
    return Buffer.from(value as ArrayBuffer);
  }

  throw new Error("Invalid thumbnail binary payload");
}

function buildThumbnailDataUrl(input: {
  buffer: Buffer;
  contentType: string;
}): string {
  return `data:${input.contentType};base64,${input.buffer.toString("base64")}`;
}

type SQLiteStoragePlatformOptions = {
  seedStarterLayouts?: boolean;
  seedStarterPages?: boolean;
  seedStarterCms?: boolean;
  seedStarterDesign?: boolean;
  seedStarterSiteSettings?: boolean;
  snapshotDir?: string;
  uploadDir?: string;
  thumbnailsDir?: string;
};

export class SQLiteStoragePlatform implements StorageAdapter {
  private client: Client;
  private initialized = false;
  private initializationPromise?: Promise<void>;
  private designSystemWriteChain: Promise<void> = Promise.resolve();
  private seedStarterLayouts: boolean;
  private seedStarterPages: boolean;
  private seedStarterCms: boolean;
  private seedStarterDesign: boolean;
  private seedStarterSiteSettings: boolean;

  private snapshotDir: string;
  private uploadDir: string;
  private thumbnailsDir: string;

  constructor(client?: Client, options: SQLiteStoragePlatformOptions = {}) {
    const dbPath = path.resolve(process.cwd(), "aria/storage/aria.db");
    this.client =
      client ??
      createClient({
        url: `file:${dbPath}`,
      });
    // New sites are initialized through first-launch onboarding. Starter
    // fixtures remain available to explicit callers, but are never populated
    // merely by opening a fresh SQLite database.
    this.seedStarterLayouts = options.seedStarterLayouts ?? false;
    this.seedStarterPages = options.seedStarterPages ?? false;
    this.seedStarterCms = options.seedStarterCms ?? false;
    this.seedStarterDesign = options.seedStarterDesign ?? false;
    this.seedStarterSiteSettings = options.seedStarterSiteSettings ?? false;
    this.snapshotDir = path.resolve(
      options.snapshotDir ?? "./aria/storage/snapshots",
    );
    this.uploadDir = path.resolve(options.uploadDir ?? "./public/uploads");
    this.thumbnailsDir = path.resolve(
      options.thumbnailsDir ?? "./aria/storage/thumbnails",
    );

    const initDirectories = [
      fs.mkdir(this.snapshotDir, { recursive: true }),
      fs.mkdir(this.uploadDir, { recursive: true }),
      fs.mkdir(this.thumbnailsDir, { recursive: true }),
    ];

    if (!client) {
      initDirectories.unshift(
        fs.mkdir(path.dirname(dbPath), { recursive: true }),
      );
    }

    Object.assign(
      this,
      createLocalizationStorageDomain({
        executor: () => this.createSiteLocalizationExecutor(),
        hasSiteLocalizationRecords: () =>
          this.hasStoredSiteLocalizationRecords(),
        syncPageLocaleUsage: (pageId, locale) =>
          this.syncPageLocaleUsage(pageId, locale),
        syncLayoutLocaleUsage: (layoutId, locale) =>
          this.syncLayoutLocaleUsage(layoutId, locale),
        clearPageLocaleUsage: (pageId, locale) =>
          this.syncMediaUsageBestEffort(
            "page-locale",
            `${pageId}:${locale}`,
            {},
          ),
        clearLayoutLocaleUsage: (layoutId, locale) =>
          this.syncMediaUsageBestEffort(
            "layout-locale",
            `${layoutId}:${locale}`,
            {},
          ),
      }),
    );
    Object.assign(
      this,
      createCmsStorageDomain({
        beforeUse: () => this.ensureInitialized(),
        executor: () => this.createCmsExecutor(),
        syncEntryUsage: (entryId, resource) =>
          this.syncMediaUsageBestEffort("cms-entry", entryId, resource),
        clearEntryUsage: (entryId) =>
          this.syncMediaUsageBestEffort("cms-entry", entryId, {}),
      }),
    );
    Object.assign(
      this,
      createRedirectStorageDomain({
        queryAll: (sql, args = []) => this.queryAllRaw(sql, asSqlArgs(args)),
        queryFirst: (sql, args = []) =>
          this.queryFirstRaw(sql, asSqlArgs(args)),
        run: (sql, args = []) => this.runRaw(sql, asSqlArgs(args)),
        createId: () => crypto.randomUUID(),
        now: () => this.nowIso(),
      }),
    );
    Object.assign(
      this,
      createWordPressImportStorageDomain({
        ensureReady: () => this.ensureWordPressImportTables(),
        queryAll: (sql, args = []) => this.queryAllRaw(sql, asSqlArgs(args)),
        queryFirst: (sql, args = []) =>
          this.queryFirstRaw(sql, asSqlArgs(args)),
        run: (sql, args = []) => this.runRaw(sql, asSqlArgs(args)),
      }),
    );
    Object.assign(
      this,
      createPageAccessStorageDomain({
        resolvePageIdentity: (idOrSlug) => this.resolvePageIdentity(idOrSlug),
        queryFirst: (sql, args = []) => this.queryFirst(sql, asSqlArgs(args)),
        queryAll: (sql, args = []) => this.queryAll(sql, asSqlArgs(args)),
        run: (sql, args = []) => this.run(sql, asSqlArgs(args)),
        nowIso: () => this.nowIso(),
        getPagePolicy: (idOrSlug) => this.getPagePolicy(idOrSlug),
        getPageVersions: (id) => this.getPageVersions(id),
      }),
    );
    Object.assign(
      this,
      createAssetOrderStorageDomain({
        queryFirst: (sql, args = []) => this.queryFirst(sql, asSqlArgs(args)),
        run: (sql, args = []) => this.run(sql, asSqlArgs(args)),
        now: () => this.nowIso(),
      }),
    );
    Object.assign(
      this,
      createPageReadStorageDomain({
        resolvePageIdentity: (idOrSlug) => this.resolvePageIdentity(idOrSlug),
        normalizeVersion: (version) => this.normalizeVersion(version),
        loadPageVersion: (id, version) => this.loadPageVersion(id, version),
        queryAll: (sql, args = []) => this.queryAll(sql, asSqlArgs(args)),
        getPageAuthorship: (idOrSlug) => this.getPageAuthorship(idOrSlug),
      }),
    );
    Object.assign(
      this,
      createPageLifecycleStorageDomain({
        resolvePageIdentity: (idOrSlug: string) =>
          this.resolvePageIdentity(idOrSlug),
        resolveLayoutVersionState: (id: string) =>
          this.resolveLayoutVersionState(id),
        getStoredVersionRow: (
          tableName:
            | "aria_page_versions"
            | "aria_layout_versions"
            | "aria_component_versions",
          id: string,
          version: string,
        ) => this.getStoredVersionRow(tableName, id, version),
        resolveStoredVersionContentHash: (input: any) =>
          this.resolveStoredVersionContentHash(input),
        syncPageUsage: (id: string, dsl: PageDSL) =>
          this.syncPageUsage(id, dsl),
        syncMediaUsageBestEffort: (
          kind: StoredMediaUsageKind,
          id: string,
          dsl: unknown,
        ) => this.syncMediaUsageBestEffort(kind, id, dsl),
        normalizeVersion: (version?: string) => this.normalizeVersion(version),
        nowIso: () => this.nowIso(),
        run: (sql: string, args = []) => this.run(sql, asSqlArgs(args)),
        runBatch: (statements) => this.runBatch(statements),
        runBatchWithChanges: (statements) =>
          this.runBatchWithChanges(statements),
        runWithChanges: (sql: string, args = []) =>
          this.runWithChanges(sql, asSqlArgs(args)),
        deletePageThumbnail: (pageId: string, stage: "draft" | "published") =>
          this.deletePageThumbnail(pageId, stage),
        pruneStoredVersionHistory: (
          resourceType: "page" | "layout" | "component",
          resourceId: string,
        ) => this.pruneStoredVersionHistory(resourceType, resourceId),
        loadPageVersion: (id: string, version: string) =>
          this.loadPageVersion(id, version),
        queryAll: (sql: string, args = []) =>
          this.queryAll(sql, asSqlArgs(args)),
        bindArgs: (args) => asSqlArgs(args),
      }),
    );
    Object.assign(
      this,
      createDslAssetStorageDomain({
        normalizeVersion: (version?: string) => this.normalizeVersion(version),
        queryFirst: (sql: string, args = []) =>
          this.queryFirst(sql, asSqlArgs(args)),
        queryAll: (sql: string, args = []) =>
          this.queryAll(sql, asSqlArgs(args)),
        resolveLayoutVersionState: (id: string) =>
          this.resolveLayoutVersionState(id),
        getStoredVersionRow: (
          tableName:
            | "aria_page_versions"
            | "aria_layout_versions"
            | "aria_component_versions",
          id: string,
          version: string,
        ) => this.getStoredVersionRow(tableName, id, version),
        resolveStoredVersionContentHash: (input: any) =>
          this.resolveStoredVersionContentHash(input),
        syncMediaUsageBestEffort: (
          kind: StoredMediaUsageKind,
          refId: string,
          resource: unknown,
        ) => this.syncMediaUsageBestEffort(kind, refId, resource),
        nowIso: () => this.nowIso(),
        run: (sql: string, args = []) => this.run(sql, asSqlArgs(args)),
        pruneStoredVersionHistory: (
          resourceType: "page" | "layout" | "component",
          resourceId: string,
        ) => this.pruneStoredVersionHistory(resourceType, resourceId),
        resolveComponentVersionState: (id: string) =>
          this.resolveComponentVersionState(id),
        resolvePageIdentity: (id: string) => this.resolvePageIdentity(id),
        bindArgs: (args) => asSqlArgs(args),
      }),
    );
    Object.assign(
      this,
      createMediaCatalogStorageDomain({
        mediaUsageExecutor: () => this.mediaUsageExecutor(),
        mediaCatalogRepository: () => this.mediaCatalogRepository(),
        mediaTransformExecutor: () => this.mediaTransformExecutor(),
      }),
    );
    Object.assign(
      this,
      createPageMetadataStorageDomain({
        queryFirst: (sql: string, args = []) =>
          this.queryFirst(sql, asSqlArgs(args)),
        run: (sql: string, args = []) => this.run(sql, asSqlArgs(args)),
        now: () => this.nowIso(),
        bindArgs: (args) => asSqlArgs(args),
      }),
    );
    Object.assign(
      this,
      createContentStateStorageDomain({
        queryFirst: (sql: string, args = []) =>
          this.queryFirst(sql, asSqlArgs(args)),
        run: (sql: string, args = []) => this.run(sql, asSqlArgs(args)),
        now: () => this.nowIso(),
        getContentSiteState: (scope) => this.getContentSiteState(scope),
      }),
    );
    Object.assign(
      this,
      createRateLimitStorageDomain({
        queryFirst: (sql: string, args = []) =>
          this.queryFirst(sql, asSqlArgs(args)),
        now: () => Date.now(),
      }),
    );

    void Promise.all(initDirectories);
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      await this.runStorageMigrations();
      await this.ensureAuthorshipColumnsAndBackfill();
      await ensurePageMetaSystemRoleConstraint({
        queryFirst: <T extends Record<string, unknown>>(
          sql: string,
          args: unknown[] = [],
        ) => this.queryFirstRaw<T>(sql, asSqlArgs(args)),
        run: (sql: string, args: unknown[] = []) =>
          this.runRaw(sql, asSqlArgs(args)),
      });

      const shouldSeedStarters =
        this.seedStarterLayouts ||
        this.seedStarterPages ||
        this.seedStarterCms ||
        this.seedStarterDesign ||
        this.seedStarterSiteSettings;

      if (shouldSeedStarters && !(await this.hasCompletedInitialSeed())) {
        if (this.seedStarterLayouts) {
          await this.ensureStarterLayoutsSeeded();
        }
        if (this.seedStarterPages) {
          await this.ensureStarterPagesSeeded();
          await this.ensureStarterNotFoundPageSeeded();
        }
        if (this.seedStarterCms) {
          await this.ensureStarterCmsSeeded();
        }
        if (this.seedStarterDesign) {
          await this.ensureStarterDesignSeeded();
        }
        if (this.seedStarterSiteSettings) {
          await this.ensureStarterSiteSettingsSeeded();
        }
      }

      this.initialized = true;
      this.initializationPromise = undefined;
    })();

    return this.initializationPromise;
  }

  private async runStorageMigrations(): Promise<void> {
    await runPendingStorageMigrations(this.client);
  }

  private async hasCompletedInitialSeed(): Promise<boolean> {
    const home = await this.queryFirstRaw<{ id: string }>(
      `SELECT id FROM aria_page_meta WHERE id = ? OR slug = ? LIMIT 1`,
      [HOME_PAGE_SLUG, HOME_PAGE_SLUG],
    );
    return Boolean(home);
  }

  private async ensureStarterLayoutsSeeded(): Promise<void> {
    const starterLayouts = await loadStarterLayouts();
    const placeholders = starterLayouts.map(() => "?").join(", ");
    const existingRows = await this.queryAllRaw<{ id: string }>(
      `SELECT id FROM aria_layout_meta WHERE id IN (${placeholders})`,
      starterLayouts.map((layout) => layout.id),
    );
    const existingIds = new Set(existingRows.map((row) => String(row.id)));

    for (const layout of starterLayouts) {
      if (existingIds.has(layout.id)) {
        continue;
      }

      await this.runRaw(
        `INSERT OR IGNORE INTO aria_layout_versions (id, version, name, status, dsl_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          layout.id,
          layout.version,
          layout.name,
          "published",
          serializeDslForStorage(layout.dsl),
          layout.updatedAt,
        ],
      );

      await this.runRaw(
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

  private async ensureStarterPagesSeeded(): Promise<void> {
    const existingHomePage = await this.queryFirstRaw<{ id: string }>(
      `SELECT id
       FROM aria_page_meta
       WHERE id = ? OR slug = ?
       LIMIT 1`,
      [HOME_PAGE_SLUG, HOME_PAGE_SLUG],
    );

    if (existingHomePage) {
      return;
    }

    const starterPage = await loadStarterPage();

    await this.runRaw(
      `INSERT OR IGNORE INTO aria_page_versions (id, version, slug, title, status, dsl_json, created_at, compiler_metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        starterPage.id,
        starterPage.version,
        starterPage.slug,
        starterPage.title,
        starterPage.status,
        serializeDslForStorage(starterPage.dsl),
        starterPage.updatedAt,
        serializeCompilerMetadata(
          buildCurrentCompilerMetadata(starterPage.updatedAt),
        ),
      ],
    );

    await this.runRaw(
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

  /** Inserts a single standalone page (not backed by version history) with a system role/access mode. */
  private async insertStarterSystemPage(
    page: PageDSL,
    options: {
      systemRole: StoredPageSystemRole;
      accessMode: StoredPageAccessMode;
    },
  ): Promise<void> {
    const now = this.nowIso();
    const version = "v1";

    await this.runRaw(
      `INSERT OR IGNORE INTO aria_page_versions (id, version, slug, title, status, dsl_json, created_at, compiler_metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        page.id,
        version,
        page.slug,
        page.title,
        "published",
        serializeDslForStorage(page),
        now,
        serializeCompilerMetadata(buildCurrentCompilerMetadata(now)),
      ],
    );

    await this.runRaw(
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

  private async ensureStarterNotFoundPageSeeded(): Promise<void> {
    const existing = await this.queryFirstRaw<{ id: string }>(
      `SELECT id FROM aria_page_meta WHERE id = ? OR system_role = 'not-found' LIMIT 1`,
      [NOT_FOUND_PAGE_ID],
    );
    if (existing) {
      return;
    }

    await this.insertStarterSystemPage(buildNotFoundPage(), {
      systemRole: "not-found",
      accessMode: "public",
    });
  }

  private async ensureStarterCmsSeeded(): Promise<void> {
    const executor: CmsStorageExecutor = {
      queryAll: <T extends Record<string, unknown>>(
        sql: string,
        args?: unknown[],
      ) => this.queryAllRaw<T>(sql, asSqlArgs(args ?? [])),
      queryFirst: <T extends Record<string, unknown>>(
        sql: string,
        args?: unknown[],
      ) => this.queryFirstRaw<T>(sql, asSqlArgs(args ?? [])),
      run: (sql: string, args?: unknown[]) =>
        this.runRaw(sql, asSqlArgs(args ?? [])),
      batch: (statements) => this.runBatch(statements),
    };

    await seedStarterBlogCollectionsIfMissing(executor, this.nowIso());
    await seedStarterMainNavCollectionIfMissing(executor, this.nowIso());

    await this.insertStarterSystemPage(buildBlogListPage(), {
      systemRole: "cms-collection",
      accessMode: "public",
    });
    await this.insertStarterSystemPage(buildBlogEntryTemplatePage(), {
      systemRole: "cms-entry",
      accessMode: "public",
    });
    await this.insertStarterSystemPage(buildTagArchiveTemplatePage(), {
      systemRole: "cms-entry",
      accessMode: "public",
    });

    await seedStarterCmsEntriesIfMissing(executor, this.nowIso());
  }

  private async ensureStarterDesignSeeded(): Promise<void> {
    const existing = await this.queryFirstRaw<{ id: string }>(
      `SELECT id FROM aria_styles LIMIT 1`,
    );
    if (existing) {
      return;
    }

    const updatedAt = this.nowIso();
    const rows = serializeStoredDesignSystemRows(
      buildStarterDesignSystem(),
      updatedAt,
    );
    for (const row of rows) {
      await this.runRaw(
        `INSERT OR IGNORE INTO aria_styles (id, styles_json, updated_at) VALUES (?, ?, ?)`,
        [row.id, row.stylesJson, row.updatedAt],
      );
    }
  }

  private async ensureStarterSiteSettingsSeeded(): Promise<void> {
    const existing = await this.queryFirstRaw<{ id: string }>(
      `SELECT id FROM aria_site_settings LIMIT 1`,
    );
    if (existing) {
      return;
    }

    await this.runRaw(
      `INSERT OR IGNORE INTO aria_site_settings (id, settings_json, updated_at) VALUES (?, ?, ?)`,
      ["default", JSON.stringify(buildStarterSiteSettings()), this.nowIso()],
    );
  }

  private async hasTable(tableName: string): Promise<boolean> {
    const row = await this.queryFirstRaw<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
      [tableName],
    );

    return Boolean(row);
  }

  private async hasColumn(
    tableName: string,
    columnName: string,
  ): Promise<boolean> {
    const rows = await this.queryAllRaw<{ name: string }>(
      `PRAGMA table_info(${tableName})`,
    );

    return rows.some((row) => String(row.name) === columnName);
  }

  /**
   * /** `0001_baseline_schema. sql` already defines
   * every canonical authorship column statically.
   */
  private async ensureAuthorshipColumnsAndBackfill(): Promise<void> {
    const authorshipContext = {
      hasTable: (table: AuthorshipTableName) => this.hasTable(table),
      hasColumn: (table: AuthorshipTableName, column: AuthorshipColumnName) =>
        this.hasColumn(table, column),
      execute: (sql: string) => this.runRaw(sql),
    };

    await applyAuthorshipColumnMigrations(authorshipContext);
    await applyAuthorshipBackfill(authorshipContext);
  }

  private async queryFirst<T extends SqlRow>(
    sql: string,
    args: SqlArgs = [],
  ): Promise<T | null> {
    await this.ensureInitialized();
    return this.queryFirstRaw<T>(sql, args);
  }

  private async queryFirstRaw<T extends SqlRow>(
    sql: string,
    args: SqlArgs = [],
  ): Promise<T | null> {
    const result = await this.client.execute({ sql, args });
    return (result.rows[0] as unknown as T | undefined) ?? null;
  }

  private async queryAll<T extends SqlRow>(
    sql: string,
    args: SqlArgs = [],
  ): Promise<T[]> {
    await this.ensureInitialized();
    return this.queryAllRaw<T>(sql, args);
  }

  private async queryAllRaw<T extends SqlRow>(
    sql: string,
    args: SqlArgs = [],
  ): Promise<T[]> {
    const result = await this.client.execute({ sql, args });
    return result.rows as unknown as T[];
  }

  private async run(sql: string, args: SqlArgs = []): Promise<void> {
    await this.ensureInitialized();
    await this.runRaw(sql, args);
  }

  private async runRaw(sql: string, args: SqlArgs = []): Promise<void> {
    await this.client.execute({ sql, args });
  }

  private async runBatch(
    statements: Array<{ sql: string; args?: readonly unknown[] }>,
  ): Promise<void> {
    await this.ensureInitialized();
    await this.client.batch(
      statements.map((statement) => ({
        sql: statement.sql,
        args: asSqlArgs(statement.args ?? []),
      })),
      "write",
    );
  }

  private async runBatchWithChanges(
    statements: Array<{ sql: string; args?: readonly unknown[] }>,
  ): Promise<Array<{ changes: number }>> {
    await this.ensureInitialized();
    const results = await this.client.batch(
      statements.map((statement) => ({
        sql: statement.sql,
        args: asSqlArgs(statement.args ?? []),
      })),
      "write",
    );
    return results.map((result) => ({ changes: result.rowsAffected }));
  }

  private async runWithChanges(
    sql: string,
    args: SqlArgs = [],
  ): Promise<{ changes: number }> {
    await this.ensureInitialized();
    const result = await this.client.execute({ sql, args });
    return { changes: result.rowsAffected };
  }

  private async getStoredThumbnailRow(input: {
    kind: StoredThumbnailKind;
    refId: string;
    stage: StoredThumbnailStage;
  }): Promise<StoredThumbnailRow | null> {
    const row = await this.queryFirst<StoredThumbnailRow>(
      `SELECT kind, ref_id, stage, content_type, size_bytes, image_blob, updated_at
       FROM aria_thumbnails
       WHERE kind = ? AND ref_id = ? AND stage = ?
       LIMIT 1`,
      [input.kind, input.refId, input.stage],
    );

    if (!row) {
      return null;
    }

    return StoredThumbnailRowSchema.parse(row);
  }

  private async saveStoredThumbnailRow(input: {
    kind: StoredThumbnailKind;
    refId: string;
    stage: StoredThumbnailStage;
    blob: Blob;
  }): Promise<{
    buffer: Buffer;
    contentType: StoredThumbnailContentType;
  }> {
    const buffer = Buffer.from(await input.blob.arrayBuffer());
    const contentType = resolveStoredThumbnailContentType(input.blob.type);
    const updatedAt = this.nowIso();

    await this.run(
      `INSERT INTO aria_thumbnails (kind, ref_id, stage, content_type, size_bytes, image_blob, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(kind, ref_id, stage) DO UPDATE SET
         content_type = excluded.content_type,
         size_bytes = excluded.size_bytes,
         image_blob = excluded.image_blob,
         updated_at = excluded.updated_at`,
      [
        input.kind,
        input.refId,
        input.stage,
        contentType,
        buffer.byteLength,
        buffer,
        updatedAt,
      ],
    );

    return {
      buffer,
      contentType,
    };
  }

  private async deleteStoredThumbnailRow(input: {
    kind: StoredThumbnailKind;
    refId: string;
    stages: readonly StoredThumbnailStage[];
  }): Promise<void> {
    await Promise.all(
      input.stages.map((stage) =>
        this.run(
          `DELETE FROM aria_thumbnails WHERE kind = ? AND ref_id = ? AND stage = ?`,
          [input.kind, input.refId, stage],
        ),
      ),
    );
  }

  private async readStoredThumbnailAsset(input: {
    kind: StoredThumbnailKind;
    refId: string;
    stage: StoredThumbnailStage;
  }): Promise<{
    buffer: Buffer;
    contentType: StoredThumbnailContentType;
  } | null> {
    const row = await this.getStoredThumbnailRow(input);

    if (!row) {
      return null;
    }

    return {
      buffer: toStoredThumbnailBuffer(row.image_blob),
      contentType: row.content_type,
    };
  }

  private normalizeVersion(version?: string): string | undefined {
    if (!version) {
      return undefined;
    }

    return version.startsWith("v") ? version.slice(1) : version;
  }

  private nowIso(): string {
    return new Date().toISOString();
  }

  private async pruneStoredVersionHistory(
    resourceType: "page" | "layout" | "component",
    resourceId: string,
  ): Promise<void> {
    await this.pruneVersionHistory!({
      resourceType,
      resourceId,
      keepLatest: DEFAULT_RECENT_VERSION_LIMIT,
      dryRun: false,
    });
  }

  private async resolvePageIdentity(idOrSlug: string): Promise<{
    id: string;
    slug: string | null;
    status: string | null;
    systemRole: StoredPageSystemRole | null;
    accessMode: StoredPageAccessMode | null;
    draftVersion: string | null;
    publishedVersion: string | null;
    currentVersion: string;
  } | null> {
    const row = await this.queryFirst<{
      id: string;
      slug: string | null;
      draft_version: string | null;
      published_version: string | null;
      current_version: string;
      status: string | null;
      system_role: StoredPageSystemRole | null;
      access_mode: StoredPageAccessMode | null;
    }>(
      `SELECT id, slug, draft_version, published_version, current_version, status,
              system_role, access_mode
       FROM aria_page_meta
       WHERE id = ? OR slug = ?
       LIMIT 1`,
      [idOrSlug, idOrSlug],
    );

    if (!row) {
      return null;
    }

    return {
      id: String(row.id),
      slug: typeof row.slug === "string" ? row.slug : null,
      status: typeof row.status === "string" ? row.status : null,
      systemRole: row.system_role ?? null,
      accessMode: row.access_mode ?? null,
      draftVersion:
        typeof row.draft_version === "string" &&
        row.draft_version.trim().length > 0
          ? String(row.draft_version)
          : null,
      publishedVersion:
        typeof row.published_version === "string" &&
        row.published_version.trim().length > 0
          ? String(row.published_version)
          : row.status === "published"
            ? String(row.current_version)
            : null,
      currentVersion: String(row.current_version),
    };
  }

  private async loadPageVersion(
    id: string,
    version: string,
  ): Promise<PageDSL | null> {
    const row = await this.queryFirst<{
      dsl_json: string;
      dependency_versions_json: string | null;
    }>(
      `SELECT dsl_json, dependency_versions_json
       FROM aria_page_versions
       WHERE id = ? AND version = ?
       LIMIT 1`,
      [id, version],
    );

    if (!row) {
      return null;
    }

    try {
      const parsed = JSON.parse(String(row.dsl_json));
      const stripped = stripLegacyClassFields(parsed);
      const validation = validatePageDSL(stripped);
      if (!validation.success) {
        log("error", "Invalid page DSL in SQLite storage", {
          error: validation.error.message,
          id,
          version,
        });
        return null;
      }

      const { dsl } = migratePageDSL(stripped);
      if (row.dependency_versions_json) {
        try {
          const dependencies = PagePublicationDependenciesSchema.safeParse(
            JSON.parse(row.dependency_versions_json),
          );
          if (dependencies.success) {
            dsl._publicationDependencies = dependencies.data;
          }
        } catch (error) {
          log("warn", "Ignoring invalid page publication dependency pins", {
            id,
            version,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return dsl as PageDSL;
    } catch (error) {
      log("error", "Failed to parse page DSL from SQLite storage", {
        error: error instanceof Error ? error.message : String(error),
        id,
        version,
      });
      return null;
    }
  }

  private async getStoredVersionRow(
    tableName:
      | "aria_page_versions"
      | "aria_layout_versions"
      | "aria_component_versions",
    id: string,
    version: string,
  ): Promise<{ dslJson: string; contentHash: string | null } | null> {
    const row = await this.queryFirst<{
      dsl_json: string;
      content_hash: string | null;
    }>(
      `SELECT dsl_json, content_hash
       FROM ${tableName}
       WHERE id = ? AND version = ?
       LIMIT 1`,
      [id, version],
    );

    if (!row) {
      return null;
    }

    return {
      dslJson: String(row.dsl_json),
      contentHash:
        typeof row.content_hash === "string" &&
        row.content_hash.trim().length > 0
          ? String(row.content_hash)
          : null,
    };
  }

  private async resolveStoredVersionContentHash(input: {
    dslJson: string;
    contentHash: string | null;
  }): Promise<string> {
    const parsedHash = ContentHashSchema.safeParse(input.contentHash);
    if (parsedHash.success) {
      return parsedHash.data;
    }

    return computeVersionContentHash(JSON.parse(input.dslJson));
  }

  private async resolveLayoutVersionState(
    idOrName: string,
  ): Promise<{ id: string; currentVersion: string } | null> {
    const row = await this.queryFirst<{
      id: string;
      current_version: string;
    }>(
      `SELECT id, current_version
       FROM aria_layout_meta
       WHERE id = ? OR name = ?
       LIMIT 1`,
      [idOrName, idOrName],
    );

    if (!row) {
      return null;
    }

    return {
      id: String(row.id),
      currentVersion: String(row.current_version),
    };
  }

  private async resolveComponentVersionState(
    idOrName: string,
  ): Promise<{ id: string; currentVersion: string } | null> {
    const row = await this.queryFirst<{
      id: string;
      current_version: string;
    }>(
      `SELECT id, current_version
       FROM aria_component_meta
       WHERE id = ? OR name = ?
       LIMIT 1`,
      [idOrName, idOrName],
    );

    if (!row) {
      return null;
    }

    return {
      id: String(row.id),
      currentVersion: String(row.current_version),
    };
  }

  private resolveUploadPath(relativePath: string): string {
    const normalized = normalizeMediaKey(relativePath);
    const fullPath = path.resolve(this.uploadDir, normalized);

    if (!fullPath.startsWith(this.uploadDir)) {
      throw new Error("Invalid media path");
    }

    return fullPath;
  }

  async deletePageDSL(id: string): Promise<void> {
    const resolved = await this.resolvePageIdentity(id);
    const targetId = resolved?.id ?? id;

    if (targetId === HOME_PAGE_SLUG || resolved?.slug === HOME_PAGE_SLUG) {
      throw new Error(`Cannot delete reserved home page: ${HOME_PAGE_SLUG}`);
    }

    await this.run(`DELETE FROM aria_page_versions WHERE id = ?`, [targetId]);
    await this.run(`DELETE FROM aria_page_meta WHERE id = ?`, [targetId]);
    await this.syncMediaUsageBestEffort("page", targetId, {});
  }

  async deleteLayoutDSL(id: string): Promise<void> {
    await this.run(`DELETE FROM aria_layout_versions WHERE id = ?`, [id]);
    await this.run(`DELETE FROM aria_layout_meta WHERE id = ?`, [id]);
    await this.syncMediaUsageBestEffort("layout", id, {});
  }

  async deleteComponentDSL(id: string): Promise<void> {
    await this.run(`DELETE FROM aria_component_versions WHERE id = ?`, [id]);
    await this.run(`DELETE FROM aria_component_meta WHERE id = ?`, [id]);
    await this.syncMediaUsageBestEffort("component", id, {});
  }

  async getSnapshot(
    slug: string,
    stage: "draft" | "published" = "published",
  ): Promise<string | null> {
    const row = await this.queryFirst<{ html: string }>(
      `SELECT html FROM aria_snapshots WHERE slug = ? AND stage = ? LIMIT 1`,
      [slug, stage],
    );

    return row ? normalizeSnapshotHtml(String(row.html)) : null;
  }

  async saveSnapshot(
    slug: string,
    html: string,
    stage: "draft" | "published" = "published",
  ): Promise<void> {
    const normalizedHtml = normalizeSnapshotHtml(html);

    await this.run(
      `INSERT INTO aria_snapshots (slug, stage, html, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(slug, stage) DO UPDATE SET
          html = excluded.html,
          updated_at = excluded.updated_at`,
      [slug, stage, normalizedHtml, this.nowIso()],
    );
  }

  async deleteSnapshot(
    slug: string,
    stage?: "draft" | "published",
  ): Promise<void> {
    if (stage) {
      await this.run(
        `DELETE FROM aria_snapshots WHERE slug = ? AND stage = ?`,
        [slug, stage],
      );
      return;
    }

    await this.run(`DELETE FROM aria_snapshots WHERE slug = ?`, [slug]);
  }

  async uploadMedia(file: File): Promise<string> {
    if (isHiddenMediaPath(file.name)) {
      throw new Error("Hidden filenames are not allowed");
    }

    const filename = createStoredMediaFilename(file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    return this.saveMedia(filename, buffer, {
      contentType: file.type || undefined,
    });
  }

  async saveMedia(
    filepath: string,
    buffer: Buffer,
    metadata?: {
      contentType?: string;
      alt?: string;
      [key: string]: unknown;
    },
  ): Promise<string> {
    const prepared = prepareMediaBufferSave(filepath, metadata);
    const fullPath = this.resolveUploadPath(prepared.normalizedPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);

    if (prepared.metadata) {
      await fs.writeFile(
        `${fullPath}.meta.json`,
        JSON.stringify(prepared.metadata, null, 2),
        "utf-8",
      );
    }

    return `/uploads/${prepared.normalizedPath}`;
  }

  async getMedia(filepath: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.resolveUploadPath(filepath));
    } catch {
      return null;
    }
  }

  async listMedia(folder?: string): Promise<
    Array<{
      path: string;
      url: string;
      size: number;
      contentType?: string;
      createdAt: string;
    }>
  > {
    const searchDir = folder ? this.resolveUploadPath(folder) : this.uploadDir;

    try {
      const mediaFiles: Array<{
        path: string;
        url: string;
        size: number;
        contentType?: string;
        createdAt: string;
      }> = [];

      const walkDirectory = async (currentDir: string): Promise<void> => {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          const relativePath = path.relative(this.uploadDir, fullPath);

          if (isHiddenMediaPath(relativePath)) {
            continue;
          }

          if (entry.isDirectory()) {
            await walkDirectory(fullPath);
            continue;
          }

          if (!entry.isFile() || !isListableMediaPath(relativePath)) {
            continue;
          }

          const stats = await fs.stat(fullPath);

          let contentType: string | undefined;
          try {
            const metadata = JSON.parse(
              await fs.readFile(`${fullPath}.meta.json`, "utf-8"),
            ) as { contentType?: string };
            contentType = metadata.contentType;
          } catch {
            contentType = undefined;
          }

          mediaFiles.push({
            path: relativePath,
            url: `/uploads/${relativePath}`,
            size: stats.size,
            contentType,
            createdAt: stats.birthtime.toISOString(),
          });
        }
      };

      await walkDirectory(searchDir);

      return mediaFiles;
    } catch {
      return [];
    }
  }

  private async syncMediaUsageBestEffort(
    kind: StoredMediaUsageKind,
    refId: string,
    resource: unknown,
  ): Promise<void> {
    try {
      await this.syncMediaUsage({
        kind,
        refId,
        resource,
        updatedAt: this.nowIso(),
      });
    } catch (error) {
      log("warn", "Failed to refresh derived media usage", {
        kind,
        refId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async syncPageLocaleUsage(
    pageId: string,
    locale: string,
  ): Promise<void> {
    const meta = await this.getPageLocaleMeta(pageId, locale);
    const versionIds = [meta?.currentVersion, meta?.publishedVersion].filter(
      (value, index, values): value is string =>
        typeof value === "string" && values.indexOf(value) === index,
    );
    const versions = await Promise.all(
      versionIds.map((version) =>
        this.getPageLocaleVersion(pageId, locale, version),
      ),
    );
    await this.syncMediaUsageBestEffort("page-locale", `${pageId}:${locale}`, {
      versions: versions.filter(Boolean),
    });
  }

  private async syncPageUsage(
    pageId: string,
    fallback: PageDSL,
  ): Promise<void> {
    const [current, published] = await Promise.all([
      this.getPageDSL(pageId),
      this.getPublishedPageDSL(pageId),
    ]);
    await this.syncMediaUsageBestEffort("page", pageId, {
      current: current ?? fallback,
      published,
    });
  }

  private async syncLayoutLocaleUsage(
    layoutId: string,
    locale: string,
  ): Promise<void> {
    const meta = await this.getLayoutLocaleMeta(layoutId, locale);
    const versionIds = [meta?.currentVersion, meta?.publishedVersion].filter(
      (value, index, values): value is string =>
        typeof value === "string" && values.indexOf(value) === index,
    );
    const versions = await Promise.all(
      versionIds.map((version) =>
        this.getLayoutLocaleVersion(layoutId, locale, version),
      ),
    );
    await this.syncMediaUsageBestEffort(
      "layout-locale",
      `${layoutId}:${locale}`,
      { versions: versions.filter(Boolean) },
    );
  }

  private mediaUsageExecutor(): MediaUsageStorageExecutor {
    return {
      queryFirst: <T extends Record<string, unknown>>(
        sql: string,
        args: readonly unknown[] = [],
      ) => this.queryFirst<T>(sql, asSqlArgs(args)),
      queryAll: <T extends Record<string, unknown>>(
        sql: string,
        args: readonly unknown[] = [],
      ) => this.queryAll<T>(sql, asSqlArgs(args)),
      run: (sql: string, args: readonly unknown[] = []) =>
        this.run(sql, asSqlArgs(args)),
      runBatch: (statements) => this.runBatch(statements),
    };
  }

  private mediaCatalogRepository(): MediaCatalogRepository {
    return MediaCatalogRepository.fromExecutor(this.mediaCatalogExecutor());
  }

  private mediaCatalogExecutor(): MediaCatalogStorageExecutor {
    return {
      queryFirst: <T extends Record<string, unknown>>(
        sql: string,
        args: readonly unknown[] = [],
      ) => this.queryFirst<T>(sql, asSqlArgs(args)),
      queryAll: <T extends Record<string, unknown>>(
        sql: string,
        args: readonly unknown[] = [],
      ) => this.queryAll<T>(sql, asSqlArgs(args)),
      run: (sql: string, args: readonly unknown[] = []) =>
        this.run(sql, asSqlArgs(args)),
    };
  }

  private mediaTransformExecutor(): MediaTransformStorageExecutor {
    return {
      queryFirst: <T extends Record<string, unknown>>(
        sql: string,
        args: readonly unknown[] = [],
      ) => this.queryFirst<T>(sql, asSqlArgs(args)),
      queryAll: <T extends Record<string, unknown>>(
        sql: string,
        args: readonly unknown[] = [],
      ) => this.queryAll<T>(sql, asSqlArgs(args)),
      run: (sql: string, args: readonly unknown[] = []) =>
        this.run(sql, asSqlArgs(args)),
      runBatch: (statements) => this.runBatch(statements),
    };
  }

  async deleteMedia(filepath: string): Promise<void> {
    const fullPath = this.resolveUploadPath(filepath);

    try {
      const stats = await fs.stat(fullPath);
      if (!stats.isFile()) {
        throw new Error("Refusing to delete non-file media path");
      }

      await fs.unlink(fullPath);
      try {
        await fs.unlink(`${fullPath}.meta.json`);
      } catch {
        // ignore missing metadata
      }
    } catch {
      // ignore missing file
    }
  }

  async getDesignSystem() {
    const rows = await this.queryAll<{ id: string; styles_json: string }>(
      `SELECT id, styles_json
       FROM aria_styles
       WHERE id = ? OR id LIKE ?
       ORDER BY id ASC`,
      [LEGACY_DESIGN_SYSTEM_ROW_ID, DESIGN_SYSTEM_ROW_ID_LIKE_PATTERN],
    );

    if (rows.length === 0) {
      return null;
    }

    return parseStoredDesignSystemRows(
      rows.map((row) => ({
        id: String(row.id),
        stylesJson: String(row.styles_json),
      })),
    );
  }

  async getDesignSystemSegments(segmentKeys: readonly string[]) {
    if (segmentKeys.length === 0) {
      return this.getDesignSystem();
    }

    const segmentIds = segmentKeys.map(createDesignSystemSegmentId);
    const placeholders = segmentIds.map(() => "?").join(", ");
    const rows = await this.queryAll<{ id: string; styles_json: string }>(
      `SELECT id, styles_json
       FROM aria_styles
       WHERE id IN (${placeholders}) OR id = ?
       ORDER BY id ASC`,
      [...segmentIds, LEGACY_DESIGN_SYSTEM_ROW_ID],
    );

    if (rows.length === 0) {
      return null;
    }

    return parseStoredDesignSystemSegments(
      rows.map((row) => ({
        id: String(row.id),
        stylesJson: String(row.styles_json),
      })),
      segmentKeys,
    );
  }

  private runExclusiveDesignSystemWrite<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    const next = this.designSystemWriteChain.then(operation, operation);
    this.designSystemWriteChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  async saveDesignSystem(
    data: UniversalDesignSystem,
    authorship?: AuthorshipSaveContext,
  ) {
    await this.runExclusiveDesignSystemWrite(async () => {
      const parsedAuthorship = parseOptionalAuthorshipSaveContext(authorship);
      UniversalDesignSystemSchema.parse(data);
      const updatedAt = this.nowIso();
      const rows = serializeStoredDesignSystemRows(data, updatedAt);

      const existingRows = await this.queryAll<{
        id: string;
        created_by_id: string | null;
        created_by_username: string | null;
        created_by_email: string | null;
      }>(
        `SELECT id, created_by_id, created_by_username, created_by_email
         FROM aria_styles
        WHERE id = ? OR id LIKE ?`,
        [LEGACY_DESIGN_SYSTEM_ROW_ID, DESIGN_SYSTEM_ROW_ID_LIKE_PATTERN],
      );

      const preservedCreateById = new Map<string, ActorSqlBindings>(
        existingRows.map((row) => [
          String(row.id),
          {
            id:
              typeof row.created_by_id === "string" ? row.created_by_id : null,
            username:
              typeof row.created_by_username === "string"
                ? row.created_by_username
                : null,
            email:
              typeof row.created_by_email === "string"
                ? row.created_by_email
                : null,
            avatarUrl: null,
          },
        ]),
      );

      await this.run("BEGIN IMMEDIATE");
      try {
        await this.run(`DELETE FROM aria_styles WHERE id = ? OR id LIKE ?`, [
          LEGACY_DESIGN_SYSTEM_ROW_ID,
          DESIGN_SYSTEM_ROW_ID_LIKE_PATTERN,
        ]);

        for (const row of rows) {
          const preservedCreate = preservedCreateById.get(row.id);
          const authorshipFragment = buildDesignSystemRowInsertAuthorship({
            authorship: parsedAuthorship,
            preservedCreate:
              preservedCreate?.id !== null && preservedCreate?.id !== undefined
                ? preservedCreate
                : undefined,
          });
          const insertPayload = appendSqlFragment(
            ["id", "styles_json", "updated_at"],
            [row.id, row.stylesJson, row.updatedAt],
            authorshipFragment,
          );

          await this.run(
            `INSERT INTO aria_styles (${insertPayload.columns.join(", ")})
           VALUES (${insertPayload.columns.map(() => "?").join(", ")})`,
            asSqlArgs(insertPayload.values),
          );
        }

        await this.run("COMMIT");
      } catch (error) {
        await this.run("ROLLBACK");
        throw error;
      }
    });
    await this.syncMediaUsageBestEffort("design-system", "design-system", data);
  }

  async getSiteSettings(): Promise<SiteSettings | null> {
    const row = await this.queryFirst<{ settings_json: string }>(
      `SELECT settings_json FROM aria_site_settings WHERE id = 'default' LIMIT 1`,
    );

    if (!row) {
      return null;
    }

    try {
      return normalizeSiteSettings(
        JSON.parse(String(row.settings_json)) as SiteSettings,
      );
    } catch {
      return null;
    }
  }

  private buildSiteSettingsUpsert(
    data: SiteSettings,
    authorship?: AuthorshipSaveContext,
  ): { sql: string; args: readonly unknown[] } {
    const parsedAuthorship = parseOptionalAuthorshipSaveContext(authorship);
    const storedSettings = serializeSiteSettingsForStorage({
      ...data,
      updated_at: Date.now(),
    });
    const updatedAt = this.nowIso();
    const insertAuthorship = buildSingletonUpsertAuthorshipAssignments(
      "insert",
      parsedAuthorship,
    );
    const updateAuthorship = buildSingletonUpsertAuthorshipAssignments(
      "update",
      parsedAuthorship,
    );
    const insertPayload = appendSqlFragment(
      ["id", "settings_json", "updated_at"],
      ["default", JSON.stringify(storedSettings), updatedAt],
      insertAuthorship,
    );
    const updateSets = [
      "settings_json = excluded.settings_json",
      "updated_at = excluded.updated_at",
      ...updateAuthorship.columnNames.map(
        (column) => `${column} = excluded.${column}`,
      ),
    ];

    return {
      sql: `INSERT INTO aria_site_settings (${insertPayload.columns.join(", ")})
       VALUES (${insertPayload.columns.map(() => "?").join(", ")})
       ON CONFLICT(id) DO UPDATE SET
         ${updateSets.join(", ")}`,
      args: insertPayload.values,
    };
  }

  async saveSiteSettings(
    data: SiteSettings,
    authorship?: AuthorshipSaveContext,
  ): Promise<void> {
    const statement = this.buildSiteSettingsUpsert(data, authorship);
    await this.run(statement.sql, asSqlArgs(statement.args));
    await this.syncMediaUsageBestEffort("site-settings", "site-settings", {
      favicon: data.favicon,
      ogImage: data.ogImage,
    });
  }

  async saveSiteSettingsWithInvalidationJobs(
    data: SiteSettings,
    jobs: readonly CacheInvalidationJob[],
    authorship?: AuthorshipSaveContext,
  ): Promise<void> {
    const statement = this.buildSiteSettingsUpsert(data, authorship);
    await this.runBatch([
      statement,
      ...jobs.map((job) =>
        cacheInvalidationInsert(CacheInvalidationJobSchema.parse(job)),
      ),
    ]);
    await this.syncMediaUsageBestEffort("site-settings", "site-settings", {
      favicon: data.favicon,
      ogImage: data.ogImage,
    });
  }

  async getThumbnail(
    type: "component" | "layout",
    slug: string,
  ): Promise<string | null> {
    const asset = await this.readStoredThumbnailAsset({
      kind: type,
      refId: slug,
      stage: "default",
    });

    if (!asset) {
      return null;
    }

    return buildThumbnailDataUrl(asset);
  }

  async saveThumbnail(
    type: "component" | "layout",
    slug: string,
    blob: Blob,
  ): Promise<string> {
    const asset = await this.saveStoredThumbnailRow({
      kind: type,
      refId: slug,
      stage: "default",
      blob,
    });

    return buildThumbnailDataUrl(asset);
  }

  async readThumbnail(type: "component" | "layout", slug: string) {
    return await this.readStoredThumbnailAsset({
      kind: type,
      refId: slug,
      stage: "default",
    });
  }

  async getPageThumbnail(
    pageId: string,
    stage: "draft" | "published" = "draft",
  ): Promise<string | null> {
    const asset = await this.readStoredThumbnailAsset({
      kind: "page",
      refId: pageId,
      stage,
    });

    if (!asset) {
      return null;
    }

    return buildPageThumbnailAdminUrl(pageId, stage);
  }

  async savePageThumbnail(
    pageId: string,
    blob: Blob,
    stage: "draft" | "published" = "draft",
  ): Promise<string> {
    await this.saveStoredThumbnailRow({
      kind: "page",
      refId: pageId,
      stage,
      blob,
    });

    return buildPageThumbnailAdminUrl(pageId, stage);
  }

  async readPageThumbnail(
    pageId: string,
    stage: "draft" | "published" = "draft",
  ) {
    return await this.readStoredThumbnailAsset({
      kind: "page",
      refId: pageId,
      stage,
    });
  }

  async deleteThumbnail(
    type: "component" | "layout",
    slug: string,
  ): Promise<void> {
    await this.deleteStoredThumbnailRow({
      kind: type,
      refId: slug,
      stages: ["default"],
    });
  }

  async deletePageThumbnail(
    pageId: string,
    stage?: "draft" | "published",
  ): Promise<void> {
    await this.deleteStoredThumbnailRow({
      kind: "page",
      refId: pageId,
      stages: stage ? [stage] : ["draft", "published"],
    });
  }

  async listStoredPageThumbnailKeys(): Promise<ReadonlySet<string>> {
    const rows = await this.queryAll<{ ref_id: string; stage: string }>(
      `SELECT ref_id, stage
       FROM aria_thumbnails
       WHERE kind = 'page'`,
      [],
    );

    return new Set(
      rows.map((row) => `${String(row.ref_id)}:${String(row.stage)}`),
    );
  }

  async listStoredComponentThumbnailKeys(): Promise<ReadonlySet<string>> {
    const rows = await this.queryAll<{ ref_id: string }>(
      `SELECT ref_id
       FROM aria_thumbnails
       WHERE kind = 'component' AND stage = 'default'`,
      [],
    );

    return new Set(rows.map((row) => String(row.ref_id)));
  }

  async getAdapterInfo(): Promise<AdapterInfo> {
    return {
      platform: "local",
      displayName: "Local SQLite",
      capabilities: {
        database: true,
        kv: false,
        objectStorage: false,
        edgeNetwork: false,
        deploymentApi: false,
      },
    };
  }

  async getAdapterMetrics(): Promise<AdapterMetrics> {
    const [pages, layouts, components] = await Promise.all([
      this.queryFirst<{ c: number }>(
        `SELECT COUNT(*) as c FROM aria_page_meta`,
      ),
      this.queryFirst<{ c: number }>(
        `SELECT COUNT(*) as c FROM aria_layout_meta`,
      ),
      this.queryFirst<{ c: number }>(
        `SELECT COUNT(*) as c FROM aria_component_meta`,
      ),
    ]);

    const pageCount = Number(pages?.c ?? 0);
    const layoutCount = Number(layouts?.c ?? 0);
    const componentCount = Number(components?.c ?? 0);

    return AdapterMetricsSchema.parse({
      platform: "local",
      capturedAt: this.nowIso(),
      storage: {
        database: {
          rowCount: pageCount + layoutCount + componentCount,
          label: `${pageCount} pages · ${layoutCount} layouts · ${componentCount} components`,
        },
      },
    });
  }

  private createSiteLocalizationExecutor(): LocalizationStorageExecutor {
    return {
      first: async <T extends Record<string, unknown>>(
        sql: string,
        args: readonly unknown[] = [],
      ) => this.queryFirst<T>(sql, asSqlArgs(args)),
      all: async <T extends Record<string, unknown>>(
        sql: string,
        args: readonly unknown[] = [],
      ) => this.queryAll<T>(sql, asSqlArgs(args)),
      batch: async (statements) => this.runBatch([...statements]),
    };
  }

  private async hasStoredSiteLocalizationRecords(): Promise<boolean> {
    const row = await this.queryFirst<{ present: number }>(
      `SELECT 1 AS present FROM aria_page_locale_meta
       UNION ALL SELECT 1 AS present FROM aria_layout_locale_meta LIMIT 1`,
    );
    return Boolean(row);
  }

  private createCmsExecutor(): CmsStorageExecutor {
    return {
      queryAll: async <T extends Record<string, unknown>>(
        sql: string,
        args: unknown[] = [],
      ) => this.queryAll<T>(sql, asSqlArgs(args)),
      queryFirst: async <T extends Record<string, unknown>>(
        sql: string,
        args: unknown[] = [],
      ) => this.queryFirst<T>(sql, asSqlArgs(args)),
      run: async (sql, args = []) => {
        await this.ensureInitialized();
        await this.runRaw(sql, asSqlArgs(args));
      },
      batch: async (statements) => {
        await this.runBatch(statements);
      },
    };
  }

  private async ensureWordPressImportTables(): Promise<void> {
    await this.ensureInitialized();
    for (const statement of WORDPRESS_IMPORT_STORAGE_STATEMENTS) {
      await this.runRaw(statement);
    }
  }
}

/** Public localization methods are composed during construction. */
export interface SQLiteStoragePlatform extends LocalizationStorageDomain {}
export interface SQLiteStoragePlatform extends CmsStorageDomain {}
export interface SQLiteStoragePlatform extends RedirectStorageDomain {}
export interface SQLiteStoragePlatform extends WordPressImportStorageDomain {}
export interface SQLiteStoragePlatform extends PageAccessStorageDomain {}
export interface SQLiteStoragePlatform extends AssetOrderStorageDomain {}
export interface SQLiteStoragePlatform extends PageReadStorageDomain {}
export interface SQLiteStoragePlatform extends PageLifecycleStorageDomain {}
export interface SQLiteStoragePlatform extends DslAssetStorageDomain {}
export interface SQLiteStoragePlatform extends MediaCatalogStorageDomain {}
export interface SQLiteStoragePlatform extends PageMetadataStorageDomain {}
export interface SQLiteStoragePlatform extends ContentStateStorageDomain {}
export interface SQLiteStoragePlatform extends RateLimitStorageDomain {}
