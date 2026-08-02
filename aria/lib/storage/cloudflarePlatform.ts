/**
 * Uses D1 for canonical aria_* storage, KV as an
 * optional snapshot cache, and R2 for media assets.
 */

type D1Row = Record<string, unknown>;
type D1Result<T extends D1Row = D1Row> = {
  results?: T[];
  meta?: {
    changes?: number;
  };
};

type D1PreparedStatementLike = {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T extends D1Row = D1Row>(): Promise<T | null>;
  all<T extends D1Row = D1Row>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
};

export type D1DatabaseLike = {
  prepare(sql: string): D1PreparedStatementLike;
  batch(statements: D1PreparedStatementLike[]): Promise<Array<D1Result>>;
};

export type KVNamespaceLike = {
  get(key: string): Promise<string | null>;
  get<T = string | null>(
    key: string,
    type: "text" | "json" | "arrayBuffer" | "stream",
  ): Promise<T | null>;
  put(
    key: string,
    value: string | ArrayBuffer | ReadableStream,
    options?: {
      cacheControl?: string;
      expiration?: number;
      expirationTtl?: number;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void>;
  delete(key: string): Promise<void>;
};

type R2ObjectLike = {
  key: string;
  size?: number;
  uploaded?: Date;
  httpMetadata?: { contentType?: string; cacheControl?: string };
};

type R2ObjectBodyLike = {
  body: ReadableStream;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
  httpMetadata?: { contentType?: string; cacheControl?: string };
};

export type R2BucketLike = {
  put(
    key: string,
    value: BodyInit | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: {
      httpMetadata?: { contentType?: string; cacheControl?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<{ key: string; etag?: string }>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
  delete(key: string): Promise<void>;
  list(opts?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    objects: R2ObjectLike[];
    truncated: boolean;
    cursor?: string;
  }>;
};

function resolveStoredThumbnailContentType(
  rawContentType: unknown,
): "image/webp" | "image/png" {
  const parsed = PageThumbnailMimeTypeSchema.safeParse(rawContentType);
  return parsed.success ? parsed.data : "image/webp";
}

function thumbnailExtensionForContentType(
  contentType: "image/webp" | "image/png",
): "webp" | "png" {
  return contentType === "image/png" ? "png" : "webp";
}

export type CloudflareStorageEnv = {
  aria_db?: unknown;
  aria_cache?: unknown;
  aria_r2?: unknown;
  R2_PUBLIC_URL?: string;
  localUploadDir?: string;
  mirrorMediaLocally?: boolean;
  [key: string]: unknown;
};

import fs from "fs/promises";
import { Buffer } from "node:buffer";
import path from "path";

import {
  appendSqlFragment,
  buildDesignSystemRowInsertAuthorship,
  buildSingletonUpsertAuthorshipAssignments,
  parseOptionalAuthorshipSaveContext,
  type ActorSqlBindings,
} from "../authorship/stamping";
import { getSnapshotCacheKey } from "../cache/snapshot-keys";
import { fetchZoneSecurityStatus } from "../cloudflare/zoneSecurity";
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
  buildPageThumbnailStorageKey,
  PageThumbnailMimeTypeSchema,
} from "../rendering/pageThumbnails";
import { validatePageDSL } from "../schemas/nodes";
import {
  UniversalDesignSystemSchema,
  type UniversalDesignSystem,
} from "../styles/universalDesignSystem";
import type { PageDSL } from "../types/nodes";
import { log } from "../utils/logger";
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
import { prepareMediaBufferSave } from "./helpers";
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
  createStudioPresenceStorageDomain,
  type StudioPresenceStorageDomain,
} from "./internal/domains/studioPresence";
import {
  createWordPressImportStorageDomain,
  type WordPressImportStorageDomain,
} from "./internal/domains/wordpressImport";
import {
  cacheInvalidationInsert,
  type LocalizationStorageExecutor,
} from "./siteLocalizationStorage";
import {
  formatLocalizationSchemaVerificationFailure,
  verifyLocalizationSchema,
} from "./verifyLocalizationSchema";
import {
  computeVersionContentHash,
  ContentHashSchema,
  DEFAULT_RECENT_VERSION_LIMIT,
} from "./versioning";

function logError(message: string, error: unknown): void {
  log("error", message, {
    error: error instanceof Error ? error.message : String(error),
  });
}

const MEDIA_OBJECT_CACHE_CONTROL =
  "public, max-age=3600, stale-while-revalidate=86400";
const SNAPSHOT_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

function buildMediaHttpMetadata(contentType?: string): {
  contentType?: string;
  cacheControl: string;
} {
  return contentType
    ? { contentType, cacheControl: MEDIA_OBJECT_CACHE_CONTROL }
    : { cacheControl: MEDIA_OBJECT_CACHE_CONTROL };
}

function hasCallableProperty(
  value: object,
  property: string,
): boolean {
  return typeof (value as Record<string, unknown>)[property] === "function";
}

function isD1DatabaseLike(value: unknown): value is D1DatabaseLike {
  return (
    typeof value === "object" &&
    value !== null &&
    hasCallableProperty(value, "prepare") &&
    hasCallableProperty(value, "batch")
  );
}

function isKVNamespaceLike(value: unknown): value is KVNamespaceLike {
  return (
    typeof value === "object" &&
    value !== null &&
    hasCallableProperty(value, "get") &&
    hasCallableProperty(value, "put") &&
    hasCallableProperty(value, "delete")
  );
}

function isR2BucketLike(value: unknown): value is R2BucketLike {
  return (
    typeof value === "object" &&
    value !== null &&
    hasCallableProperty(value, "get") &&
    hasCallableProperty(value, "put") &&
    hasCallableProperty(value, "delete") &&
    hasCallableProperty(value, "list")
  );
}

export class CloudflareStoragePlatform implements StorageAdapter {
  db?: D1DatabaseLike;
  kv?: KVNamespaceLike;
  r2?: R2BucketLike;
  r2BaseUrl: string;
  private initialized = false;
  private initializationPromise?: Promise<void>;
  private localUploadDir: string;
  private mirrorMediaLocallyOverride?: boolean;

  constructor(env?: CloudflareStorageEnv) {
    this.db = isD1DatabaseLike(env?.aria_db) ? env.aria_db : undefined;
    this.kv = isKVNamespaceLike(env?.aria_cache) ? env.aria_cache : undefined;
    this.r2 = isR2BucketLike(env?.aria_r2) ? env.aria_r2 : undefined;
    this.r2BaseUrl =
      typeof env?.R2_PUBLIC_URL === "string" ? env.R2_PUBLIC_URL : "";
    try {
      this.localUploadDir = path.resolve(
        env?.localUploadDir ?? "./public/uploads",
      );
    } catch {
      this.localUploadDir = env?.localUploadDir ?? "/public/uploads";
    }
    this.mirrorMediaLocallyOverride = env?.mirrorMediaLocally;

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
        beforeUse: () => this.ensureCanonicalTables(),
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
        queryAll: (sql, args = []) => this.queryAll(sql, [...args]),
        queryFirst: (sql, args = []) => this.queryFirst(sql, [...args]),
        run: (sql, args = []) => this.run(sql, [...args]),
        createId: () => crypto.randomUUID(),
        now: () => this.nowIso(),
      }),
    );
    Object.assign(
      this,
      createWordPressImportStorageDomain({
        ensureReady: () => this.ensureCanonicalTables(),
        queryAll: (sql, args = []) => this.queryAll(sql, [...args]),
        queryFirst: (sql, args = []) => this.queryFirst(sql, [...args]),
        run: (sql, args = []) => this.run(sql, [...args]),
      }),
    );
    Object.assign(
      this,
      createPageAccessStorageDomain({
        resolvePageIdentity: (idOrSlug) => this.resolvePageIdentity(idOrSlug),
        queryFirst: (sql, args = []) => this.queryFirst(sql, [...args]),
        queryAll: (sql, args = []) => this.queryAll(sql, [...args]),
        run: (sql, args = []) => this.run(sql, [...args]),
        nowIso: () => this.nowIso(),
        getPagePolicy: (idOrSlug) => this.getPagePolicy(idOrSlug),
        getPageVersions: (id) => this.getPageVersions(id),
      }),
    );
    Object.assign(
      this,
      createAssetOrderStorageDomain({
        queryFirst: (sql, args = []) => this.queryFirst(sql, [...args]),
        run: (sql, args = []) => this.run(sql, [...args]),
        now: () => this.nowIso(),
      }),
    );
    Object.assign(
      this,
      createPageReadStorageDomain({
        resolvePageIdentity: (idOrSlug) => this.resolvePageIdentity(idOrSlug),
        normalizeVersion: (version) => this.normalizeVersion(version),
        loadPageVersion: (id, version) => this.loadPageVersion(id, version),
        queryAll: (sql, args = []) => this.queryAll(sql, [...args]),
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
        resolveStoredVersionContentHash: (input) =>
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
        run: (sql: string, args = []) => this.run(sql, [...args]),
        runBatch: (statements) => this.runBatch(statements),
        runBatchWithChanges: (statements) =>
          this.runBatchWithChanges(statements),
        runWithChanges: (sql: string, args = []) =>
          this.runWithChanges(sql, [...args]),
        deletePageThumbnail: (pageId: string, stage: "draft" | "published") =>
          this.deletePageThumbnail(pageId, stage),
        pruneStoredVersionHistory: (
          resourceType: "page" | "layout" | "component",
          resourceId: string,
        ) => this.pruneStoredVersionHistory(resourceType, resourceId),
        loadPageVersion: (id: string, version: string) =>
          this.loadPageVersion(id, version),
        queryAll: (sql: string, args = []) => this.queryAll(sql, [...args]),
        bindArgs: (args) => [...args],
      }),
    );
    Object.assign(
      this,
      createDslAssetStorageDomain({
        normalizeVersion: (version?: string) => this.normalizeVersion(version),
        queryFirst: (sql: string, args = []) => this.queryFirst(sql, [...args]),
        queryAll: (sql: string, args = []) => this.queryAll(sql, [...args]),
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
        resolveStoredVersionContentHash: (input) =>
          this.resolveStoredVersionContentHash(input),
        syncMediaUsageBestEffort: (
          kind: StoredMediaUsageKind,
          refId: string,
          resource: unknown,
        ) => this.syncMediaUsageBestEffort(kind, refId, resource),
        nowIso: () => this.nowIso(),
        run: (sql: string, args = []) => this.run(sql, [...args]),
        pruneStoredVersionHistory: (
          resourceType: "page" | "layout" | "component",
          resourceId: string,
        ) => this.pruneStoredVersionHistory(resourceType, resourceId),
        resolveComponentVersionState: (id: string) =>
          this.resolveComponentVersionState(id),
        resolvePageIdentity: (id: string) => this.resolvePageIdentity(id),
        bindArgs: (args) => [...args],
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
        queryFirst: (sql: string, args = []) => this.queryFirst(sql, [...args]),
        run: (sql: string, args = []) => this.run(sql, [...args]),
        now: () => this.nowIso(),
        bindArgs: (args) => [...args],
      }),
    );
    Object.assign(
      this,
      createContentStateStorageDomain({
        queryFirst: (sql: string, args = []) => this.queryFirst(sql, [...args]),
        run: (sql: string, args = []) => this.run(sql, [...args]),
        now: () => this.nowIso(),
        getContentSiteState: (scope) => this.getContentSiteState(scope),
      }),
    );
    Object.assign(
      this,
      createStudioPresenceStorageDomain({
        queryFirst: (sql: string, args = []) => this.queryFirst(sql, [...args]),
        queryAll: (sql: string, args = []) => this.queryAll(sql, [...args]),
        run: (sql: string, args = []) => this.run(sql, [...args]),
      }),
    );
    Object.assign(
      this,
      createRateLimitStorageDomain({
        queryFirst: (sql: string, args = []) => this.queryFirst(sql, [...args]),
        now: () => Date.now(),
      }),
    );
  }

  private requireDb(): D1DatabaseLike {
    if (!this.db) {
      throw new Error("D1 binding missing");
    }

    return this.db;
  }

  private async ensureCanonicalTables(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      try {
        const db = this.requireDb();
        const verification = await verifyLocalizationSchema({
          async execute(sql, args = []) {
            const result = await db
              .prepare(sql)
              .bind(...args)
              .all();
            return {
              rows: (result.results ?? []) as ReadonlyArray<
                Record<string, unknown>
              >,
            };
          },
        });
        if (!verification.ok) {
          throw new Error(
            formatLocalizationSchemaVerificationFailure(verification),
          );
        }
        this.initialized = true;
      } catch (error) {
        this.initializationPromise = undefined;
        throw error;
      } finally {
        if (this.initialized) {
          this.initializationPromise = undefined;
        }
      }
    })();

    return this.initializationPromise;
  }

  private async queryFirst<T extends D1Row>(
    sql: string,
    args: unknown[] = [],
  ): Promise<T | null> {
    await this.ensureCanonicalTables();
    return this.requireDb()
      .prepare(sql)
      .bind(...args)
      .first<T>();
  }

  private async queryAll<T extends D1Row>(
    sql: string,
    args: unknown[] = [],
  ): Promise<T[]> {
    await this.ensureCanonicalTables();
    const result = await this.requireDb()
      .prepare(sql)
      .bind(...args)
      .all<T>();
    return result.results ?? [];
  }

  private async run(sql: string, args: unknown[] = []): Promise<void> {
    await this.ensureCanonicalTables();
    await this.requireDb()
      .prepare(sql)
      .bind(...args)
      .run();
  }

  private async runBatch(
    statements: Array<{ sql: string; args?: readonly unknown[] }>,
  ): Promise<void> {
    await this.ensureCanonicalTables();
    const db = this.requireDb();
    await db.batch(
      statements.map((statement) =>
        db.prepare(statement.sql).bind(...(statement.args ?? [])),
      ),
    );
  }

  private async runBatchWithChanges(
    statements: Array<{ sql: string; args?: readonly unknown[] }>,
  ): Promise<Array<{ changes: number }>> {
    await this.ensureCanonicalTables();
    const db = this.requireDb();
    const results = await db.batch(
      statements.map((statement) =>
        db.prepare(statement.sql).bind(...(statement.args ?? [])),
      ),
    );
    return results.map((result) => ({
      changes: Number(result.meta?.changes ?? 0),
    }));
  }

  private async runWithChanges(
    sql: string,
    args: unknown[] = [],
  ): Promise<{ changes: number }> {
    await this.ensureCanonicalTables();
    const result = await this.requireDb()
      .prepare(sql)
      .bind(...args)
      .run();
    return { changes: Number(result.meta?.changes ?? 0) };
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

  private snapshotKey(slug: string, stage: "draft" | "published"): string {
    return getSnapshotCacheKey(`${stage}:${slug}`);
  }

  private mediaPublicUrl(key: string): string {
    const normalizedKey = normalizeMediaKey(key);
    const trimmedBase = this.r2BaseUrl.replace(/\/+$/, "");
    if (trimmedBase.length > 0) {
      return `${trimmedBase}/${normalizedKey}`;
    }

    return `/uploads/${normalizedKey}`;
  }

  private shouldMirrorMediaLocally(): boolean {
    if (typeof this.mirrorMediaLocallyOverride === "boolean") {
      return this.mirrorMediaLocallyOverride;
    }

    return (
      import.meta.env.DEV &&
      typeof process !== "undefined" &&
      process.release?.name === "node"
    );
  }

  private resolveLocalUploadPath(filepath: string): string {
    return path.join(this.localUploadDir, normalizeMediaKey(filepath));
  }

  private async mirrorMediaLocally(
    filepath: string,
    buffer: Buffer,
    metadata?: {
      contentType?: string;
      alt?: string;
      [key: string]: unknown;
    },
  ): Promise<void> {
    if (!this.shouldMirrorMediaLocally()) {
      return;
    }

    const fullPath = this.resolveLocalUploadPath(filepath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);

    if (metadata) {
      await fs.writeFile(
        `${fullPath}.meta.json`,
        JSON.stringify(metadata, null, 2),
        "utf-8",
      );
    }
  }

  private async listLocalMedia(folder?: string): Promise<
    Array<{
      path: string;
      url: string;
      size: number;
      contentType?: string;
      createdAt: string;
    }>
  > {
    const searchDir = folder
      ? path.resolve(this.localUploadDir, normalizeMediaKey(folder))
      : this.localUploadDir;
    const mediaFiles: Array<{
      path: string;
      url: string;
      size: number;
      contentType?: string;
      createdAt: string;
    }> = [];

    const walkDirectory = async (currentDir: string): Promise<void> => {
      let entries: import("node:fs").Dirent[];
      try {
        entries = await fs.readdir(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relativePath = path.relative(this.localUploadDir, fullPath);

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

        const normalizedPath = relativePath.replace(/\\+/g, "/");
        mediaFiles.push({
          path: normalizedPath,
          url: `/uploads/${normalizedPath}`,
          size: stats.size,
          contentType,
          createdAt: stats.birthtime.toISOString(),
        });
      }
    };

    await walkDirectory(searchDir);
    return mediaFiles;
  }

  private shouldUseLocalMediaFallback(): boolean {
    if (typeof this.mirrorMediaLocallyOverride === "boolean") {
      return this.mirrorMediaLocallyOverride;
    }

    return import.meta.env.DEV;
  }

  private async deleteMirroredMedia(filepath: string): Promise<void> {
    if (!this.shouldMirrorMediaLocally()) {
      return;
    }

    const fullPath = this.resolveLocalUploadPath(filepath);

    try {
      await fs.unlink(fullPath);
    } catch {
      // ignore missing mirrored file
    }

    try {
      await fs.unlink(`${fullPath}.meta.json`);
    } catch {
      // ignore missing mirrored metadata
    }
  }

  private async resolvePageIdentity(idOrSlug: string): Promise<{
    id: string;
    status: string | null;
    systemRole: StoredPageSystemRole | null;
    accessMode: StoredPageAccessMode | null;
    draftVersion: string | null;
    publishedVersion: string | null;
    currentVersion: string;
  } | null> {
    const row = await this.queryFirst<{
      id: string;
      draft_version: string | null;
      published_version: string | null;
      current_version: string;
      status: string | null;
      system_role: StoredPageSystemRole | null;
      access_mode: StoredPageAccessMode | null;
    }>(
      `SELECT id, draft_version, published_version, current_version, status,
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
        logError("Invalid page DSL in Cloudflare storage", validation.error);
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
      logError("Failed to parse page DSL in Cloudflare storage", error);
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

  private async resolveLayoutIdentity(
    idOrName: string,
  ): Promise<string | null> {
    const row = await this.queryFirst<{ id: string }>(
      `SELECT id
       FROM aria_layout_meta
       WHERE id = ? OR name = ?
       LIMIT 1`,
      [idOrName, idOrName],
    );

    return row ? String(row.id) : null;
  }

  private async resolveComponentIdentity(
    idOrName: string,
  ): Promise<string | null> {
    const row = await this.queryFirst<{ id: string }>(
      `SELECT id
       FROM aria_component_meta
       WHERE id = ? OR name = ?
       LIMIT 1`,
      [idOrName, idOrName],
    );

    return row ? String(row.id) : null;
  }

  async deletePageDSL(id: string): Promise<void> {
    if (id === "index") {
      throw new Error("Cannot delete reserved home page: index");
    }

    const resolved = await this.resolvePageIdentity(id);
    const targetId = resolved?.id ?? id;

    await this.runBatch([
      { sql: `DELETE FROM aria_page_versions WHERE id = ?`, args: [targetId] },
      { sql: `DELETE FROM aria_page_meta WHERE id = ?`, args: [targetId] },
    ]);
    await this.syncMediaUsageBestEffort("page", targetId, {});
  }

  async deleteLayoutDSL(id: string): Promise<void> {
    const targetId = (await this.resolveLayoutIdentity(id)) ?? id;
    await this.runBatch([
      {
        sql: `DELETE FROM aria_layout_versions WHERE id = ?`,
        args: [targetId],
      },
      { sql: `DELETE FROM aria_layout_meta WHERE id = ?`, args: [targetId] },
    ]);
    await this.syncMediaUsageBestEffort("layout", targetId, {});
  }

  async deleteComponentDSL(id: string): Promise<void> {
    const targetId = (await this.resolveComponentIdentity(id)) ?? id;
    await this.runBatch([
      {
        sql: `DELETE FROM aria_component_versions WHERE id = ?`,
        args: [targetId],
      },
      { sql: `DELETE FROM aria_component_meta WHERE id = ?`, args: [targetId] },
    ]);
    await this.syncMediaUsageBestEffort("component", targetId, {});
  }

  async getSnapshot(
    slug: string,
    stage: "draft" | "published" = "published",
  ): Promise<string | null> {
    if (this.kv) {
      const cached = await this.kv.get(this.snapshotKey(slug, stage));
      if (typeof cached === "string") {
        const normalizedCached = normalizeSnapshotHtml(cached);
        if (normalizedCached !== cached) {
          await this.kv.put(this.snapshotKey(slug, stage), normalizedCached, {
            expirationTtl: SNAPSHOT_CACHE_TTL_SECONDS,
          });
        }
        return normalizedCached;
      }
    }

    const row = await this.queryFirst<{ html: string }>(
      `SELECT html FROM aria_snapshots WHERE slug = ? AND stage = ? LIMIT 1`,
      [slug, stage],
    );

    if (!row) {
      return null;
    }

    const html = normalizeSnapshotHtml(String(row.html));
    if (this.kv) {
      await this.kv.put(this.snapshotKey(slug, stage), html, {
        expirationTtl: SNAPSHOT_CACHE_TTL_SECONDS,
      });
    }

    return html;
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

    if (this.kv) {
      await this.kv.put(this.snapshotKey(slug, stage), normalizedHtml, {
        expirationTtl: SNAPSHOT_CACHE_TTL_SECONDS,
      });
    }
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
      if (this.kv) {
        await this.kv.delete(this.snapshotKey(slug, stage));
      }
      return;
    }

    await this.run(`DELETE FROM aria_snapshots WHERE slug = ?`, [slug]);
    if (this.kv) {
      await Promise.all([
        this.kv.delete(this.snapshotKey(slug, "draft")),
        this.kv.delete(this.snapshotKey(slug, "published")),
      ]);
    }
  }

  async uploadMedia(file: File): Promise<string> {
    if (!this.r2) {
      throw new Error("R2 binding missing");
    }

    if (isHiddenMediaPath(file.name)) {
      throw new Error("Hidden filenames are not allowed");
    }

    const filename = createStoredMediaFilename(file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    await this.r2.put(filename, buffer, {
      httpMetadata: buildMediaHttpMetadata(file.type || undefined),
    });
    await this.mirrorMediaLocally(filename, buffer, {
      contentType: file.type,
    });
    return this.mediaPublicUrl(filename);
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
    if (!this.r2) {
      throw new Error("R2 binding missing");
    }

    const prepared = prepareMediaBufferSave(filepath, metadata);
    await this.r2.put(prepared.normalizedPath, buffer, {
      httpMetadata: buildMediaHttpMetadata(prepared.contentType),
      customMetadata: prepared.customMetadata,
    });

    await this.mirrorMediaLocally(
      prepared.normalizedPath,
      buffer,
      prepared.metadata,
    );

    return this.mediaPublicUrl(prepared.normalizedPath);
  }

  async getMedia(filepath: string): Promise<Buffer | null> {
    if (!this.r2) {
      throw new Error("R2 binding missing");
    }

    try {
      const object = await this.r2.get(normalizeMediaKey(filepath));
      if (!object) {
        return null;
      }

      return Buffer.from(await object.arrayBuffer());
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
    if (!this.r2) {
      throw new Error("R2 binding missing");
    }

    try {
      const prefix = folder
        ? `${normalizeMediaKey(folder).replace(/\/$/, "")}/`
        : undefined;
      const objects: R2ObjectLike[] = [];
      let cursor: string | undefined;

      do {
        const listed = await this.r2.list({ prefix, cursor });
        objects.push(...(listed.objects || []));
        cursor = listed.truncated ? listed.cursor : undefined;
      } while (cursor);

      const remoteFiles: Array<{
        path: string;
        url: string;
        size: number;
        contentType?: string;
        createdAt: string;
      }> = objects
        .filter((obj) => isListableMediaPath(obj.key))
        .map((obj) => ({
          path: obj.key,
          url: this.mediaPublicUrl(obj.key),
          size: obj.size ?? 0,
          contentType: obj.httpMetadata?.contentType,
          createdAt: obj.uploaded?.toISOString() ?? this.nowIso(),
        }));

      if (!this.shouldUseLocalMediaFallback()) {
        return remoteFiles;
      }

      const filesByPath = new Map(
        remoteFiles.map((file) => [file.path, file] as const),
      );
      for (const file of await this.listLocalMedia(folder)) {
        if (!filesByPath.has(file.path)) {
          filesByPath.set(file.path, file);
        }
      }

      return [...filesByPath.values()];
    } catch (error) {
      logError("Failed to list media", error);
      return this.shouldUseLocalMediaFallback()
        ? this.listLocalMedia(folder)
        : [];
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
      ) => this.queryFirst<T>(sql, [...args]),
      queryAll: <T extends Record<string, unknown>>(
        sql: string,
        args: readonly unknown[] = [],
      ) => this.queryAll<T>(sql, [...args]),
      run: (sql: string, args: readonly unknown[] = []) =>
        this.run(sql, [...args]),
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
      ) => this.queryFirst<T>(sql, [...args]),
      queryAll: <T extends Record<string, unknown>>(
        sql: string,
        args: readonly unknown[] = [],
      ) => this.queryAll<T>(sql, [...args]),
      run: (sql: string, args: readonly unknown[] = []) =>
        this.run(sql, [...args]),
    };
  }

  private mediaTransformExecutor(): MediaTransformStorageExecutor {
    return {
      queryFirst: <T extends Record<string, unknown>>(
        sql: string,
        args: readonly unknown[] = [],
      ) => this.queryFirst<T>(sql, [...args]),
      queryAll: <T extends Record<string, unknown>>(
        sql: string,
        args: readonly unknown[] = [],
      ) => this.queryAll<T>(sql, [...args]),
      run: (sql: string, args: readonly unknown[] = []) =>
        this.run(sql, [...args]),
      runBatch: (statements) => this.runBatch(statements),
    };
  }

  async deleteMedia(path: string): Promise<void> {
    if (!this.r2) {
      throw new Error("R2 binding missing");
    }

    const normalized = normalizeMediaKey(path);
    if (normalized.endsWith("/")) {
      throw new Error("Refusing to delete a media directory path");
    }

    await this.r2.delete(normalized);
    await this.deleteMirroredMedia(normalized);
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

  async saveDesignSystem(
    data: UniversalDesignSystem,
    authorship?: AuthorshipSaveContext,
  ) {
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
          id: typeof row.created_by_id === "string" ? row.created_by_id : null,
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

    const statements: Array<{ sql: string; args?: unknown[] }> = [
      {
        sql: `DELETE FROM aria_styles WHERE id = ? OR id LIKE ?`,
        args: [LEGACY_DESIGN_SYSTEM_ROW_ID, DESIGN_SYSTEM_ROW_ID_LIKE_PATTERN],
      },
    ];

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
      statements.push({
        sql: `INSERT INTO aria_styles (${insertPayload.columns.join(", ")})
              VALUES (${insertPayload.columns.map(() => "?").join(", ")})`,
        args: insertPayload.values,
      });
    }

    await this.runBatch(statements);
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
  ): { sql: string; args: unknown[] } {
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
    await this.run(statement.sql, statement.args);
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
    if (!this.r2) {
      return null;
    }

    for (const extension of ["webp", "png"] as const) {
      const key = `thumbnails/${type}/${slug}.${extension}`;
      try {
        const object = await this.r2.get(key);
        if (object) {
          return this.mediaPublicUrl(key);
        }
      } catch {
        return null;
      }
    }

    return null;
  }

  async saveThumbnail(
    type: "component" | "layout",
    slug: string,
    blob: Blob,
  ): Promise<string> {
    if (!this.r2) {
      throw new Error("R2 binding missing");
    }

    const contentType = resolveStoredThumbnailContentType(blob.type);
    const key = `thumbnails/${type}/${slug}.${thumbnailExtensionForContentType(contentType)}`;
    await this.r2.put(key, await blob.arrayBuffer(), {
      httpMetadata: {
        contentType,
      },
    });

    return this.mediaPublicUrl(key);
  }

  async readThumbnail(type: "component" | "layout", slug: string) {
    if (!this.r2) {
      return null;
    }

    for (const extension of ["webp", "png"] as const) {
      const key = `thumbnails/${type}/${slug}.${extension}`;
      try {
        const object = await this.r2.get(key);
        if (!object) {
          continue;
        }

        return {
          buffer: Buffer.from(await object.arrayBuffer()),
          contentType: resolveStoredThumbnailContentType(
            object.httpMetadata?.contentType,
          ),
        };
      } catch {
        return null;
      }
    }

    return null;
  }

  async getPageThumbnail(
    pageId: string,
    stage: "draft" | "published" = "draft",
  ): Promise<string | null> {
    if (!this.r2) {
      return null;
    }
    const key = buildPageThumbnailStorageKey(pageId, stage);
    try {
      const object = await this.r2.get(key);
      return object ? this.mediaPublicUrl(key) : null;
    } catch {
      return null;
    }
  }

  async savePageThumbnail(
    pageId: string,
    blob: Blob,
    stage: "draft" | "published" = "draft",
  ): Promise<string> {
    if (!this.r2) {
      throw new Error("R2 binding missing");
    }
    const key = buildPageThumbnailStorageKey(pageId, stage);
    const contentType = resolveStoredThumbnailContentType(blob.type);
    await this.r2.put(key, await blob.arrayBuffer(), {
      httpMetadata: {
        contentType,
      },
    });

    return this.mediaPublicUrl(key);
  }

  async readPageThumbnail(
    pageId: string,
    stage: "draft" | "published" = "draft",
  ) {
    if (!this.r2) {
      return null;
    }
    const key = buildPageThumbnailStorageKey(pageId, stage);
    try {
      const object = await this.r2.get(key);
      if (!object) {
        return null;
      }

      return {
        buffer: Buffer.from(await object.arrayBuffer()),
        contentType: resolveStoredThumbnailContentType(
          object.httpMetadata?.contentType,
        ),
      };
    } catch {
      return null;
    }
  }

  async deleteThumbnail(
    type: "component" | "layout",
    slug: string,
  ): Promise<void> {
    if (!this.r2) {
      throw new Error("R2 binding missing");
    }

    await Promise.all([
      this.r2.delete(`thumbnails/${type}/${slug}.webp`),
      this.r2.delete(`thumbnails/${type}/${slug}.png`),
    ]);
  }

  async deletePageThumbnail(
    pageId: string,
    stage?: "draft" | "published",
  ): Promise<void> {
    if (!this.r2) {
      return;
    }

    const stages = stage ? [stage] : (["draft", "published"] as const);
    await Promise.all(
      stages.map((currentStage) =>
        this.r2!.delete(buildPageThumbnailStorageKey(pageId, currentStage)),
      ),
    );
  }

  async listStoredPageThumbnailKeys(): Promise<ReadonlySet<string>> {
    if (!this.r2) {
      return new Set();
    }

    const thumbnailKeys = new Set<string>();
    let cursor: string | undefined;

    do {
      const listed = await this.r2.list({
        prefix: "thumbnails/page/",
        cursor,
      });

      for (const object of listed.objects) {
        const segments = object.key.split("/");
        const pageId = segments[2];
        const stageWithExtension = segments[3];
        const stage = stageWithExtension?.replace(/\.(webp|png)$/i, "");
        if (pageId && stage) {
          thumbnailKeys.add(
            `${decodeURIComponent(pageId)}:${decodeURIComponent(stage)}`,
          );
        }
      }

      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);

    return thumbnailKeys;
  }

  async listStoredComponentThumbnailKeys(): Promise<ReadonlySet<string>> {
    if (!this.r2) {
      return new Set();
    }

    const thumbnailKeys = new Set<string>();
    let cursor: string | undefined;

    do {
      const listed = await this.r2.list({
        prefix: "thumbnails/component/",
        cursor,
      });

      for (const object of listed.objects) {
        const componentIdWithExtension = object.key.split("/")[2];
        const componentId = componentIdWithExtension?.replace(
          /\.(webp|png)$/i,
          "",
        );
        if (componentId) {
          thumbnailKeys.add(decodeURIComponent(componentId));
        }
      }

      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);

    return thumbnailKeys;
  }

  async getAdapterInfo(): Promise<AdapterInfo> {
    return {
      platform: "cloudflare",
      displayName: "Cloudflare",
      capabilities: {
        database: !!this.db,
        kv: !!this.kv,
        objectStorage: !!this.r2,
        edgeNetwork: true,
        deploymentApi: false,
      },
    };
  }

  async getAdapterMetrics(): Promise<AdapterMetrics> {
    let dbRowCount = 0;
    let r2ObjectCount = 0;

    if (this.db) {
      try {
        await this.ensureCanonicalTables();
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
        dbRowCount =
          Number(pages?.c ?? 0) +
          Number(layouts?.c ?? 0) +
          Number(components?.c ?? 0);
      } catch {
        dbRowCount = 0;
      }
    }

    if (this.r2) {
      try {
        const list = await this.r2.list({ limit: 1000 });
        r2ObjectCount = list.objects?.length ?? 0;
      } catch {
        r2ObjectCount = 0;
      }
    }

    const zoneSecurity = await fetchZoneSecurityStatus();

    return AdapterMetricsSchema.parse({
      platform: "cloudflare",
      capturedAt: this.nowIso(),
      network: {
        status: "online",
        ddosProtection: true,
        globalCdn: true,
        edgeCaching: !!this.kv,
        sslEnabled: zoneSecurity.sslEnabled ?? true,
        wafEnabled: zoneSecurity.wafEnabled ?? true,
        botProtection: zoneSecurity.botProtection ?? true,
      },
      storage: {
        database: this.db
          ? { rowCount: dbRowCount, label: "D1 Database" }
          : undefined,
        kv: { available: !!this.kv, label: "KV Namespace" },
        objectStorage: this.r2
          ? { objectCount: r2ObjectCount, label: "R2 Bucket" }
          : undefined,
      },
    });
  }

  private createSiteLocalizationExecutor(): LocalizationStorageExecutor {
    return {
      first: async <T extends Record<string, unknown>>(
        sql: string,
        args: readonly unknown[] = [],
      ) => this.queryFirst<T>(sql, [...args]),
      all: async <T extends Record<string, unknown>>(
        sql: string,
        args: readonly unknown[] = [],
      ) => this.queryAll<T>(sql, [...args]),
      batch: async (statements) =>
        this.runBatch(
          statements.map((statement) => ({
            sql: statement.sql,
            args: statement.args ? [...statement.args] : [],
          })),
        ),
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
      ) => this.queryAll<T>(sql, args),
      queryFirst: async <T extends Record<string, unknown>>(
        sql: string,
        args: unknown[] = [],
      ) => this.queryFirst<T>(sql, args),
      run: async (sql, args = []) => this.run(sql, args),
      batch: async (statements) => this.runBatch(statements),
    };
  }
}

/** Public localization methods are composed during construction. */
export interface CloudflareStoragePlatform extends LocalizationStorageDomain {}
export interface CloudflareStoragePlatform extends CmsStorageDomain {}
export interface CloudflareStoragePlatform extends RedirectStorageDomain {}
export interface CloudflareStoragePlatform extends WordPressImportStorageDomain {}
export interface CloudflareStoragePlatform extends PageAccessStorageDomain {}
export interface CloudflareStoragePlatform extends AssetOrderStorageDomain {}
export interface CloudflareStoragePlatform extends PageReadStorageDomain {}
export interface CloudflareStoragePlatform extends PageLifecycleStorageDomain {}
export interface CloudflareStoragePlatform extends DslAssetStorageDomain {}
export interface CloudflareStoragePlatform extends MediaCatalogStorageDomain {}
export interface CloudflareStoragePlatform extends PageMetadataStorageDomain {}
export interface CloudflareStoragePlatform extends ContentStateStorageDomain {}
export interface CloudflareStoragePlatform extends StudioPresenceStorageDomain {}
export interface CloudflareStoragePlatform extends RateLimitStorageDomain {}
