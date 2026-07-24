import type { StorageAdapter } from "../../adapter";
import {
  cmsAcquireEntryEditLock,
  cmsAnonymizePublicCommentsForDeletedAuthor,
  cmsAppendAuditEvent,
  cmsAbortSearchScopeRebuild,
  cmsBeginSearchScopeRebuild,
  cmsCleanupInactiveSearchScopeDocuments,
  cmsCommitSearchScopeRebuild,
  cmsCountEntriesByCollection,
  cmsCreatePublicComment,
  cmsCreateReviewAnnotation,
  cmsDeleteCollection,
  cmsDeleteEntry,
  cmsDeleteSearchDocuments,
  cmsGetCollection,
  cmsGetCollectionPolicy,
  cmsGetEntry,
  cmsGetEntryRevision,
  cmsGetEntryWorkflow,
  cmsGetLatestEntryAutosave,
  cmsGetPublicComment,
  cmsGetPublicCommentByIdempotency,
  cmsGetPublicCommentModerationMetrics,
  cmsGetPublicCommentSubmissionStats,
  cmsGetSearchDocumentStats,
  cmsListAuditEvents,
  cmsListCollectionPermissions,
  cmsListCollections,
  cmsListEntries,
  cmsListEntryPresenceLeases,
  cmsListEntryRevisions,
  cmsListPublicComments,
  cmsListReviewAnnotations,
  cmsModeratePublicComment,
  cmsPruneEntryAutosaves,
  cmsPrunePublicCommentRateReservations,
  cmsReleaseEntryEditLock,
  cmsReplaceCollectionPermissions,
  cmsReplaceSearchDocuments,
  cmsReopenReviewAnnotation,
  cmsReservePublicCommentRateSlot,
  cmsResolveReviewAnnotation,
  cmsSaveCollection,
  cmsSaveCollectionPolicy,
  cmsSaveEntry,
  cmsSaveEntryAutosave,
  cmsSaveEntryRevision,
  cmsSaveEntryWorkflow,
  cmsSearchCmsDocuments,
  cmsUpsertEntryPresenceLease,
  cmsWriteSearchScopeGeneration,
  type CmsStorageExecutor,
} from "../../../cms/storage";
import { cmsCommitEntryMutation } from "../../../cms/storage/entryMutation";

export type CmsStorageDomain = Pick<
  StorageAdapter,
  | "listCollections"
  | "countEntriesByCollection"
  | "getCollection"
  | "saveCollection"
  | "deleteCollection"
  | "listEntries"
  | "getEntry"
  | "saveEntry"
  | "commitCmsEntryMutation"
  | "deleteEntry"
  | "listEntryRevisions"
  | "getEntryRevision"
  | "saveEntryRevision"
  | "listCollectionPermissions"
  | "replaceCollectionPermissions"
  | "getCollectionPolicy"
  | "saveCollectionPolicy"
  | "appendCmsAuditEvent"
  | "listCmsAuditEvents"
  | "createPublicComment"
  | "getPublicComment"
  | "getPublicCommentByIdempotency"
  | "getPublicCommentSubmissionStats"
  | "reservePublicCommentRateSlot"
  | "anonymizePublicCommentsForDeletedAuthor"
  | "prunePublicCommentRateReservations"
  | "getPublicCommentModerationMetrics"
  | "listPublicComments"
  | "moderatePublicComment"
  | "saveCmsEntryAutosave"
  | "getLatestCmsEntryAutosave"
  | "pruneCmsEntryAutosaves"
  | "upsertCmsEntryPresenceLease"
  | "listCmsEntryPresenceLeases"
  | "acquireCmsEntryEditLock"
  | "releaseCmsEntryEditLock"
  | "getCmsEntryWorkflow"
  | "saveCmsEntryWorkflow"
  | "listCmsReviewAnnotations"
  | "createCmsReviewAnnotation"
  | "resolveCmsReviewAnnotation"
  | "reopenCmsReviewAnnotation"
  | "replaceCmsSearchDocuments"
  | "deleteCmsSearchDocuments"
  | "searchCmsSearchDocuments"
  | "getCmsSearchDocumentStats"
  | "beginCmsSearchScopeRebuild"
  | "writeCmsSearchScopeGeneration"
  | "commitCmsSearchScopeRebuild"
  | "abortCmsSearchScopeRebuild"
  | "cleanupInactiveCmsSearchDocuments"
>;

export type CmsStorageDomainContext = {
  beforeUse(): Promise<void>;
  executor(): CmsStorageExecutor;
  syncEntryUsage(entryId: string, resource: unknown): Promise<void>;
  clearEntryUsage(entryId: string): Promise<void>;
};

/** Shared adapter façade for CMS operations already implemented by cms/storage. */
export function createCmsStorageDomain(
  context: CmsStorageDomainContext,
): CmsStorageDomain {
  const use = async <T>(
    operation: (executor: CmsStorageExecutor) => Promise<T>,
  ) => {
    await context.beforeUse();
    return operation(context.executor());
  };

  return {
    listCollections: (options) =>
      use((executor) => cmsListCollections(executor, options)),
    countEntriesByCollection: (collectionIds) =>
      use((executor) => cmsCountEntriesByCollection(executor, collectionIds)),
    getCollection: (idOrName) =>
      use((executor) => cmsGetCollection(executor, idOrName)),
    saveCollection: (collection) =>
      use((executor) => cmsSaveCollection(executor, collection)),
    deleteCollection: (id) =>
      use((executor) => cmsDeleteCollection(executor, id)),
    listEntries: (params) =>
      use((executor) => cmsListEntries(executor, params)),
    getEntry: (options) => use((executor) => cmsGetEntry(executor, options)),
    async saveEntry(record, options) {
      const saved = await use((executor) =>
        cmsSaveEntry(executor, record, options),
      );
      await context.syncEntryUsage(saved.entry.id, saved);
      return saved;
    },
    async commitCmsEntryMutation(input) {
      const saved = await use((executor) =>
        cmsCommitEntryMutation(executor, input),
      );
      await context.syncEntryUsage(saved.entry.id, saved);
      return saved;
    },
    async deleteEntry(collectionId, entryId) {
      await use((executor) => cmsDeleteEntry(executor, collectionId, entryId));
      await context.clearEntryUsage(entryId);
    },
    listEntryRevisions: (entryId, options) =>
      use((executor) => cmsListEntryRevisions(executor, entryId, options)),
    getEntryRevision: (revisionId) =>
      use((executor) => cmsGetEntryRevision(executor, revisionId)),
    saveEntryRevision: (revision) =>
      use((executor) => cmsSaveEntryRevision(executor, revision)),
    listCollectionPermissions: (collectionId) =>
      use((executor) => cmsListCollectionPermissions(executor, collectionId)),
    replaceCollectionPermissions: (collectionId, permissions) =>
      use((executor) =>
        cmsReplaceCollectionPermissions(executor, collectionId, permissions),
      ),
    getCollectionPolicy: (collectionId) =>
      use((executor) => cmsGetCollectionPolicy(executor, collectionId)),
    saveCollectionPolicy: (policy) =>
      use((executor) => cmsSaveCollectionPolicy(executor, policy)),
    appendCmsAuditEvent: (event) =>
      use((executor) => cmsAppendAuditEvent(executor, event)),
    listCmsAuditEvents: (options) =>
      use((executor) => cmsListAuditEvents(executor, options)),
    createPublicComment: (comment) =>
      use((executor) => cmsCreatePublicComment(executor, comment)),
    getPublicComment: (id) =>
      use((executor) => cmsGetPublicComment(executor, id)),
    getPublicCommentByIdempotency: (input) =>
      use((executor) => cmsGetPublicCommentByIdempotency(executor, input)),
    getPublicCommentSubmissionStats: (input) =>
      use((executor) => cmsGetPublicCommentSubmissionStats(executor, input)),
    reservePublicCommentRateSlot: (input) =>
      use((executor) => cmsReservePublicCommentRateSlot(executor, input)),
    anonymizePublicCommentsForDeletedAuthor: (authorId) =>
      use((executor) =>
        cmsAnonymizePublicCommentsForDeletedAuthor(executor, authorId),
      ),
    prunePublicCommentRateReservations: (before) =>
      use((executor) =>
        cmsPrunePublicCommentRateReservations(executor, before),
      ),
    getPublicCommentModerationMetrics: (input) =>
      use((executor) => cmsGetPublicCommentModerationMetrics(executor, input)),
    listPublicComments: (options) =>
      use((executor) => cmsListPublicComments(executor, options)),
    moderatePublicComment: (input) =>
      use((executor) => cmsModeratePublicComment(executor, input)),
    saveCmsEntryAutosave: (autosave) =>
      use((executor) => cmsSaveEntryAutosave(executor, autosave)),
    getLatestCmsEntryAutosave: (input) =>
      use((executor) => cmsGetLatestEntryAutosave(executor, input)),
    pruneCmsEntryAutosaves: (now) =>
      use((executor) => cmsPruneEntryAutosaves(executor, now)),
    upsertCmsEntryPresenceLease: (lease) =>
      use((executor) => cmsUpsertEntryPresenceLease(executor, lease)),
    listCmsEntryPresenceLeases: (input) =>
      use((executor) => cmsListEntryPresenceLeases(executor, input)),
    acquireCmsEntryEditLock: (input) =>
      use((executor) => cmsAcquireEntryEditLock(executor, input)),
    releaseCmsEntryEditLock: (input) =>
      use((executor) => cmsReleaseEntryEditLock(executor, input)),
    getCmsEntryWorkflow: (input) =>
      use((executor) => cmsGetEntryWorkflow(executor, input)),
    saveCmsEntryWorkflow: (input) =>
      use((executor) => cmsSaveEntryWorkflow(executor, input)),
    listCmsReviewAnnotations: (input) =>
      use((executor) => cmsListReviewAnnotations(executor, input)),
    createCmsReviewAnnotation: (annotation) =>
      use((executor) => cmsCreateReviewAnnotation(executor, annotation)),
    resolveCmsReviewAnnotation: (input) =>
      use((executor) => cmsResolveReviewAnnotation(executor, input)),
    reopenCmsReviewAnnotation: (input) =>
      use((executor) => cmsReopenReviewAnnotation(executor, input)),
    replaceCmsSearchDocuments: (documents) =>
      use((executor) => cmsReplaceSearchDocuments(executor, documents)),
    deleteCmsSearchDocuments: (options) =>
      use((executor) => cmsDeleteSearchDocuments(executor, options)),
    searchCmsSearchDocuments: (options) =>
      use((executor) => cmsSearchCmsDocuments(executor, options)),
    getCmsSearchDocumentStats: () =>
      use((executor) => cmsGetSearchDocumentStats(executor)),
    beginCmsSearchScopeRebuild: (options) =>
      use((executor) => cmsBeginSearchScopeRebuild(executor, options)),
    writeCmsSearchScopeGeneration: (options) =>
      use((executor) => cmsWriteSearchScopeGeneration(executor, options)),
    commitCmsSearchScopeRebuild: (options) =>
      use((executor) => cmsCommitSearchScopeRebuild(executor, options)),
    abortCmsSearchScopeRebuild: (options) =>
      use((executor) => cmsAbortSearchScopeRebuild(executor, options)),
    cleanupInactiveCmsSearchDocuments: (collectionId) =>
      use((executor) =>
        cmsCleanupInactiveSearchScopeDocuments(executor, collectionId),
      ),
  };
}
