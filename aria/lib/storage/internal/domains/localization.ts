import type { StorageAdapter } from "../../adapter";
import {
  acquireLocaleRouteLease,
  claimDueCacheInvalidationJobs,
  completeCacheInvalidationJob,
  deleteLayoutLocale,
  deletePageLocale,
  enqueueCacheInvalidationJob,
  failCacheInvalidationJob,
  getCacheInvalidationJob,
  getLayoutLocaleMeta,
  getLayoutLocaleVersion,
  getPageLocaleMeta,
  getPageLocaleRoute,
  getPageLocaleVersion,
  listLayoutLocaleRecords,
  listPageLocaleRecords,
  listPublishedPageLocaleRoutes,
  publishLayoutLocaleDraft,
  publishPageLocaleDraft,
  releaseLocaleRouteLease,
  replaceLayoutLocaleRecord,
  replacePageLocaleRecord,
  resolvePublishedPageLocale,
  saveLayoutLocaleDraft,
  savePageLocaleDraft,
  unpublishLayoutLocale,
  unpublishPageLocale,
  type LocalizationStorageExecutor,
} from "../../siteLocalizationStorage";

/**
 * The localization and invalidation surface is identical for every
 * SQL-backed adapter. Backends supply the executor and their media-usage.
 */
export type LocalizationStorageDomain = Pick<
  StorageAdapter,
  | "getPageLocaleMeta"
  | "getPageLocaleVersion"
  | "getPageLocaleRoute"
  | "savePageLocaleDraft"
  | "publishPageLocaleDraft"
  | "unpublishPageLocale"
  | "deletePageLocale"
  | "resolvePublishedPageLocale"
  | "listPublishedPageLocaleRoutes"
  | "listPageLocaleRecords"
  | "replacePageLocaleRecord"
  | "hasSiteLocalizationRecords"
  | "getLayoutLocaleMeta"
  | "getLayoutLocaleVersion"
  | "listLayoutLocaleRecords"
  | "replaceLayoutLocaleRecord"
  | "saveLayoutLocaleDraft"
  | "publishLayoutLocaleDraft"
  | "unpublishLayoutLocale"
  | "deleteLayoutLocale"
  | "acquireLocaleRouteLease"
  | "releaseLocaleRouteLease"
  | "enqueueCacheInvalidationJob"
  | "getCacheInvalidationJob"
  | "claimDueCacheInvalidationJobs"
  | "completeCacheInvalidationJob"
  | "failCacheInvalidationJob"
>;

export type LocalizationStorageDomainContext = {
  executor(): LocalizationStorageExecutor;
  hasSiteLocalizationRecords(): Promise<boolean>;
  syncPageLocaleUsage(pageId: string, locale: string): Promise<void>;
  syncLayoutLocaleUsage(layoutId: string, locale: string): Promise<void>;
  clearPageLocaleUsage(pageId: string, locale: string): Promise<void>;
  clearLayoutLocaleUsage(layoutId: string, locale: string): Promise<void>;
};

export function createLocalizationStorageDomain(
  context: LocalizationStorageDomainContext,
): LocalizationStorageDomain {
  const executor = () => context.executor();

  return {
    getPageLocaleMeta: (pageId, locale) =>
      getPageLocaleMeta(executor(), pageId, locale),
    getPageLocaleVersion: (pageId, locale, version) =>
      getPageLocaleVersion(executor(), pageId, locale, version),
    getPageLocaleRoute: (pageId, locale) =>
      getPageLocaleRoute(executor(), pageId, locale),
    async savePageLocaleDraft(input) {
      const saved = await savePageLocaleDraft(executor(), input);
      await context.syncPageLocaleUsage(
        input.version.pageId,
        input.version.locale,
      );
      return saved;
    },
    publishPageLocaleDraft: (input) =>
      publishPageLocaleDraft(executor(), input),
    unpublishPageLocale: (input) => unpublishPageLocale(executor(), input),
    async deletePageLocale(input) {
      const deleted = await deletePageLocale(executor(), input);
      await context.clearPageLocaleUsage(input.pageId, input.locale);
      return deleted;
    },
    resolvePublishedPageLocale: (locale, pathnameKey) =>
      resolvePublishedPageLocale(executor(), locale, pathnameKey),
    listPublishedPageLocaleRoutes: (pageId) =>
      listPublishedPageLocaleRoutes(executor(), pageId),
    listPageLocaleRecords: (options) =>
      listPageLocaleRecords(executor(), options),
    async replacePageLocaleRecord(record) {
      await replacePageLocaleRecord(executor(), record);
      await context.syncPageLocaleUsage(record.meta.pageId, record.meta.locale);
    },
    hasSiteLocalizationRecords: () => context.hasSiteLocalizationRecords(),
    getLayoutLocaleMeta: (layoutId, locale) =>
      getLayoutLocaleMeta(executor(), layoutId, locale),
    getLayoutLocaleVersion: (layoutId, locale, version) =>
      getLayoutLocaleVersion(executor(), layoutId, locale, version),
    listLayoutLocaleRecords: (options) =>
      listLayoutLocaleRecords(executor(), options),
    async replaceLayoutLocaleRecord(record) {
      await replaceLayoutLocaleRecord(executor(), record);
      await context.syncLayoutLocaleUsage(
        record.meta.layoutId,
        record.meta.locale,
      );
    },
    async saveLayoutLocaleDraft(input) {
      const saved = await saveLayoutLocaleDraft(executor(), input);
      await context.syncLayoutLocaleUsage(
        input.version.layoutId,
        input.version.locale,
      );
      return saved;
    },
    publishLayoutLocaleDraft: (input) =>
      publishLayoutLocaleDraft(executor(), input),
    unpublishLayoutLocale: (input) => unpublishLayoutLocale(executor(), input),
    async deleteLayoutLocale(input) {
      const deleted = await deleteLayoutLocale(executor(), input);
      await context.clearLayoutLocaleUsage(input.layoutId, input.locale);
      return deleted;
    },
    acquireLocaleRouteLease: (input) =>
      acquireLocaleRouteLease(executor(), input),
    releaseLocaleRouteLease: (input) =>
      releaseLocaleRouteLease(executor(), input),
    enqueueCacheInvalidationJob: (job) =>
      enqueueCacheInvalidationJob(executor(), job),
    getCacheInvalidationJob: (id) => getCacheInvalidationJob(executor(), id),
    claimDueCacheInvalidationJobs: (input) =>
      claimDueCacheInvalidationJobs(executor(), input),
    completeCacheInvalidationJob: (input) =>
      completeCacheInvalidationJob(executor(), input),
    failCacheInvalidationJob: (input) =>
      failCacheInvalidationJob(executor(), input),
  };
}
