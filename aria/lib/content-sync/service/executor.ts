import {
  toContentSyncRevisionSnapshot,
  type ContentSyncHistoryItem,
  type ContentSyncJob,
  type ContentSyncSummary,
} from "../schema";
import { createEmptyContentSyncSummary } from "../schema";
import type { StorageAdapter } from "../../storage/adapter";
import type {
  AuthorshipSaveContext,
  ContentMutationKind,
} from "../../storage/adapter";
import type { ContentSiteState, OrderKind } from "../../storage/adapter";
import type { AriaEntryRevision } from "../../cms/types";
import type {
  LayoutLocaleRecord,
  PageLocaleRecord,
} from "../../localization/siteTranslationSchemas";
import {
  removeCmsCollectionSearchDocuments,
  removeCmsEntrySearchDocuments,
  syncCmsCollectionSearchDocument,
  syncCmsEntrySearchDocuments,
} from "../../cms/services/search";

export interface ContentSyncExecutorInput {
  dryRunJob: ContentSyncJob;
  dryRunItems: readonly ContentSyncHistoryItem[];
  localAdapter: StorageAdapter;
  remoteAdapter: StorageAdapter;
  actorId?: string;
  authorship?: AuthorshipSaveContext;
}

export interface ContentSyncExecutorResult {
  summary: ContentSyncSummary;
  items: ContentSyncHistoryItem[];
  localState: ContentSiteState | null;
  remoteState: ContentSiteState | null;
}

function summarizeResults(total: number): ContentSyncSummary {
  return {
    ...createEmptyContentSyncSummary(),
    total,
  };
}

function mapToResultStatus(input: {
  action: ContentSyncHistoryItem["action"];
  error?: string;
}): ContentSyncHistoryItem["resultStatus"] {
  if (input.error) {
    return "failed";
  }

  if (input.action === "skip") {
    return "skipped";
  }

  if (input.action === "conflict") {
    return "conflicted";
  }

  return "applied";
}

function getSourceAdapter(input: ContentSyncExecutorInput): StorageAdapter {
  return input.dryRunJob.direction === "push"
    ? input.localAdapter
    : input.remoteAdapter;
}

function getTargetAdapter(input: ContentSyncExecutorInput): StorageAdapter {
  return input.dryRunJob.direction === "push"
    ? input.remoteAdapter
    : input.localAdapter;
}

function getSourceVersionForItem(input: {
  direction: ContentSyncJob["direction"];
  item: ContentSyncHistoryItem;
}): string | undefined {
  return input.direction === "push"
    ? input.item.localVersion
    : input.item.remoteVersion;
}

function withMutationKind(
  authorship: AuthorshipSaveContext | undefined,
  mutationKind: ContentMutationKind,
): AuthorshipSaveContext | undefined {
  if (!authorship) {
    return undefined;
  }

  return {
    ...authorship,
    mutationKind,
  };
}

function parseCmsEntryResourceId(resourceId: string): {
  collectionId: string;
  entryId: string;
} {
  const separatorIndex = resourceId.indexOf("/");
  if (separatorIndex <= 0 || separatorIndex === resourceId.length - 1) {
    throw new Error(`Invalid CMS entry resource id: ${resourceId}`);
  }

  return {
    collectionId: resourceId.slice(0, separatorIndex),
    entryId: resourceId.slice(separatorIndex + 1),
  };
}

function parseLocalizedResourceId(resourceId: string): {
  ownerId: string;
  locale: string;
} {
  const separatorIndex = resourceId.lastIndexOf("|");
  if (separatorIndex <= 0 || separatorIndex === resourceId.length - 1) {
    throw new Error(`Invalid localized resource id: ${resourceId}`);
  }
  try {
    return {
      ownerId: decodeURIComponent(resourceId.slice(0, separatorIndex)),
      locale: resourceId.slice(separatorIndex + 1),
    };
  } catch {
    throw new Error(`Invalid localized resource id: ${resourceId}`);
  }
}

async function findPageLocaleRecord(
  adapter: StorageAdapter,
  resourceId: string,
): Promise<PageLocaleRecord> {
  const { ownerId, locale } = parseLocalizedResourceId(resourceId);
  const record = (await adapter.listPageLocaleRecords()).find(
    (candidate) =>
      candidate.meta.pageId === ownerId && candidate.meta.locale === locale,
  );
  if (!record) {
    throw new Error(`Source page locale not found: ${resourceId}`);
  }
  return record;
}

async function findLayoutLocaleRecord(
  adapter: StorageAdapter,
  resourceId: string,
): Promise<LayoutLocaleRecord> {
  const { ownerId, locale } = parseLocalizedResourceId(resourceId);
  const record = (await adapter.listLayoutLocaleRecords()).find(
    (candidate) =>
      candidate.meta.layoutId === ownerId && candidate.meta.locale === locale,
  );
  if (!record) {
    throw new Error(`Source layout locale not found: ${resourceId}`);
  }
  return record;
}

async function ensureCanonicalPageVersions(input: {
  pageId: string;
  versions: readonly string[];
  sourceAdapter: StorageAdapter;
  targetAdapter: StorageAdapter;
  authorship?: AuthorshipSaveContext;
}): Promise<void> {
  for (const version of new Set(input.versions)) {
    const source = await input.sourceAdapter.getPageDSL(input.pageId, version);
    if (!source) {
      throw new Error(`Localized page source version not found: ${input.pageId}@${version}`);
    }
    await input.targetAdapter.savePageDSL(
      input.pageId,
      source,
      {
        preserveVersion: true,
        overwriteVersionIfExists: true,
        skipIfContentUnchanged: false,
        versionHint: version,
      },
      withMutationKind(input.authorship, "save-page"),
    );
  }
  // Inserting historical source revisions updates the canonical draft pointer.
  // Restore the source's active revision before replacing locale pointers.
  const current = await input.sourceAdapter.getPageDSL(input.pageId);
  if (current?.version) {
    await input.targetAdapter.savePageDSL(
      input.pageId,
      current,
      {
        preserveVersion: true,
        overwriteVersionIfExists: true,
        skipIfContentUnchanged: false,
        versionHint: current.version,
      },
      withMutationKind(input.authorship, "save-page"),
    );
  }
}

async function ensureCanonicalLayoutVersions(input: {
  layoutId: string;
  versions: readonly string[];
  sourceAdapter: StorageAdapter;
  targetAdapter: StorageAdapter;
  authorship?: AuthorshipSaveContext;
}): Promise<void> {
  for (const version of new Set(input.versions)) {
    const source = await input.sourceAdapter.getLayoutDSL(input.layoutId, version);
    if (!source) {
      throw new Error(`Localized layout source version not found: ${input.layoutId}@${version}`);
    }
    await input.targetAdapter.saveLayoutDSL(
      input.layoutId,
      source,
      {
        preserveVersion: true,
        overwriteVersionIfExists: true,
        skipIfContentUnchanged: false,
        versionHint: version,
      },
      withMutationKind(input.authorship, "save-layout"),
    );
  }
  const current = await input.sourceAdapter.getLayoutDSL(input.layoutId);
  if (current?.version) {
    await input.targetAdapter.saveLayoutDSL(
      input.layoutId,
      current,
      {
        preserveVersion: true,
        overwriteVersionIfExists: true,
        skipIfContentUnchanged: false,
        versionHint: current.version,
      },
      withMutationKind(input.authorship, "save-layout"),
    );
  }
}

async function listAllEntryRevisions(
  adapter: StorageAdapter,
  entryId: string,
): Promise<AriaEntryRevision[]> {
  const limit = 200;
  const revisions: AriaEntryRevision[] = [];

  for (let offset = 0; ; offset += limit) {
    const page = await adapter.listEntryRevisions(entryId, { limit, offset });
    revisions.push(...page);

    if (page.length < limit) {
      return revisions;
    }
  }
}

async function copyMissingEntryRevisions(input: {
  entryId: string;
  sourceAdapter: StorageAdapter;
  targetAdapter: StorageAdapter;
}): Promise<void> {
  const revisions = await listAllEntryRevisions(
    input.sourceAdapter,
    input.entryId,
  );

  for (const revision of revisions.reverse()) {
    const existing = await input.targetAdapter.getEntryRevision(revision.id);
    if (!existing) {
      await input.targetAdapter.saveEntryRevision(revision);
    }
  }
}

async function applyCreateOrUpdate(input: {
  direction: ContentSyncJob["direction"];
  item: ContentSyncHistoryItem;
  sourceAdapter: StorageAdapter;
  targetAdapter: StorageAdapter;
  authorship?: AuthorshipSaveContext;
}): Promise<void> {
  const sourceVersion = getSourceVersionForItem({
    direction: input.direction,
    item: input.item,
  });

  switch (input.item.resourceType) {
    case "page": {
      let page = await input.sourceAdapter.getPageDSL(
        input.item.resourceId,
        sourceVersion,
      );
      if (!page && sourceVersion) {
        page = await input.sourceAdapter.getPageDSL(input.item.resourceId);
      }
      if (!page)
        throw new Error(`Source page not found: ${input.item.resourceId}`);
      await input.targetAdapter.savePageDSL(
        input.item.resourceId,
        page,
        {
          preserveVersion: Boolean(sourceVersion),
          overwriteVersionIfExists: input.direction === "push",
          skipIfContentUnchanged: true,
          versionHint: sourceVersion,
        },
        withMutationKind(input.authorship, "save-page"),
      );
      return;
    }
    case "page-locale": {
      const record = await findPageLocaleRecord(
        input.sourceAdapter,
        input.item.resourceId,
      );
      await ensureCanonicalPageVersions({
        pageId: record.meta.pageId,
        versions: record.versions.map((version) => version.sourceVersion),
        sourceAdapter: input.sourceAdapter,
        targetAdapter: input.targetAdapter,
        authorship: input.authorship,
      });
      const layoutPins = new Map<string, string[]>();
      for (const version of record.versions) {
        if (version.layoutId && version.fallbackLayoutVersion) {
          layoutPins.set(version.layoutId, [
            ...(layoutPins.get(version.layoutId) ?? []),
            version.fallbackLayoutVersion,
          ]);
        }
      }
      for (const [layoutId, versions] of layoutPins) {
        await ensureCanonicalLayoutVersions({
          layoutId,
          versions,
          sourceAdapter: input.sourceAdapter,
          targetAdapter: input.targetAdapter,
          authorship: input.authorship,
        });
      }
      await input.targetAdapter.replacePageLocaleRecord(record);
      return;
    }
    case "layout": {
      let layout = await input.sourceAdapter.getLayoutDSL(
        input.item.resourceId,
        sourceVersion,
      );
      if (!layout && sourceVersion) {
        layout = await input.sourceAdapter.getLayoutDSL(input.item.resourceId);
      }
      if (!layout)
        throw new Error(`Source layout not found: ${input.item.resourceId}`);
      await input.targetAdapter.saveLayoutDSL(
        input.item.resourceId,
        layout,
        {
          preserveVersion: Boolean(sourceVersion),
          overwriteVersionIfExists: input.direction === "push",
          skipIfContentUnchanged: true,
          versionHint: sourceVersion,
        },
        withMutationKind(input.authorship, "save-layout"),
      );
      return;
    }
    case "layout-locale": {
      const record = await findLayoutLocaleRecord(
        input.sourceAdapter,
        input.item.resourceId,
      );
      await ensureCanonicalLayoutVersions({
        layoutId: record.meta.layoutId,
        versions: record.versions.map((version) => version.sourceVersion),
        sourceAdapter: input.sourceAdapter,
        targetAdapter: input.targetAdapter,
        authorship: input.authorship,
      });
      await input.targetAdapter.replaceLayoutLocaleRecord(record);
      return;
    }
    case "component": {
      let component = await input.sourceAdapter.getComponentDSL(
        input.item.resourceId,
        sourceVersion,
      );
      if (!component && sourceVersion) {
        component = await input.sourceAdapter.getComponentDSL(
          input.item.resourceId,
        );
      }
      if (!component) {
        throw new Error(`Source component not found: ${input.item.resourceId}`);
      }
      await input.targetAdapter.saveComponentDSL(
        input.item.resourceId,
        component,
        {
          preserveVersion: Boolean(sourceVersion),
          overwriteVersionIfExists: input.direction === "push",
          skipIfContentUnchanged: true,
          versionHint: sourceVersion,
        },
        withMutationKind(input.authorship, "save-component"),
      );
      return;
    }
    case "styles": {
      const designSystem = await input.sourceAdapter.getDesignSystem();
      if (!designSystem) throw new Error("Source design system not found");
      await input.targetAdapter.saveDesignSystem(
        designSystem,
        withMutationKind(input.authorship, "save-styles"),
      );
      return;
    }
    case "site-settings": {
      const settings = await input.sourceAdapter.getSiteSettings();
      if (!settings) throw new Error("Source site settings not found");
      await input.targetAdapter.saveSiteSettings(
        settings,
        withMutationKind(input.authorship, "save-site-settings"),
      );
      return;
    }
    case "order": {
      const order = await input.sourceAdapter.getOrder(
        input.item.resourceId as OrderKind,
      );
      await input.targetAdapter.saveOrder(
        input.item.resourceId as OrderKind,
        order,
      );
      return;
    }
    case "snapshot": {
      throw new Error(
        "Snapshot sync is no longer supported in the runtime delivery path",
      );
    }
    case "metadata": {
      const metadata = await input.sourceAdapter.getPageMetadata(
        input.item.resourceId,
      );
      if (!metadata) {
        throw new Error(
          `Source page metadata not found: ${input.item.resourceId}`,
        );
      }
      await input.targetAdapter.savePageMetadata(
        input.item.resourceId,
        metadata,
        withMutationKind(input.authorship, "save-page-metadata"),
      );
      return;
    }
    case "cms-collection": {
      const collection = await input.sourceAdapter.getCollection(
        input.item.resourceId,
      );
      if (!collection) {
        throw new Error(
          `Source CMS collection not found: ${input.item.resourceId}`,
        );
      }
      await input.targetAdapter.saveCollection(collection);
      await syncCmsCollectionSearchDocument(input.targetAdapter, collection);
      return;
    }
    case "cms-entry": {
      const { collectionId, entryId } = parseCmsEntryResourceId(
        input.item.resourceId,
      );
      const record = await input.sourceAdapter.getEntry({
        collectionId,
        idOrSlug: entryId,
        includeRelations: true,
      });
      if (!record) {
        throw new Error(`Source CMS entry not found: ${input.item.resourceId}`);
      }
      await input.targetAdapter.saveEntry(record, {
        relations: record.relations,
        replaceLocales: true,
      });
      await syncCmsEntrySearchDocuments(input.targetAdapter, record);
      await copyMissingEntryRevisions({
        entryId,
        sourceAdapter: input.sourceAdapter,
        targetAdapter: input.targetAdapter,
      });
      return;
    }
  }
}

async function applyDelete(input: {
  item: ContentSyncHistoryItem;
  targetAdapter: StorageAdapter;
}): Promise<void> {
  switch (input.item.resourceType) {
    case "page":
      await input.targetAdapter.deletePageDSL(input.item.resourceId);
      return;
    case "page-locale": {
      const { ownerId: pageId, locale } = parseLocalizedResourceId(
        input.item.resourceId,
      );
      const meta = await input.targetAdapter.getPageLocaleMeta(pageId, locale);
      if (!meta) return;
      if (meta.publishedVersion) {
        await input.targetAdapter.unpublishPageLocale({
          pageId,
          locale,
          updatedAt: new Date().toISOString(),
        });
      }
      await input.targetAdapter.deletePageLocale({
        pageId,
        locale,
        expectedCurrentVersion: meta.currentVersion,
      });
      return;
    }
    case "layout":
      await input.targetAdapter.deleteLayoutDSL(input.item.resourceId);
      return;
    case "layout-locale": {
      const { ownerId: layoutId, locale } = parseLocalizedResourceId(
        input.item.resourceId,
      );
      const meta = await input.targetAdapter.getLayoutLocaleMeta(layoutId, locale);
      if (!meta) return;
      if (meta.publishedVersion) {
        await input.targetAdapter.unpublishLayoutLocale({
          layoutId,
          locale,
          updatedAt: new Date().toISOString(),
        });
      }
      await input.targetAdapter.deleteLayoutLocale({
        layoutId,
        locale,
        expectedCurrentVersion: meta.currentVersion,
      });
      return;
    }
    case "component":
      await input.targetAdapter.deleteComponentDSL(input.item.resourceId);
      return;
    case "cms-collection":
      await input.targetAdapter.deleteCollection(input.item.resourceId);
      await removeCmsCollectionSearchDocuments(
        input.targetAdapter,
        input.item.resourceId,
      );
      return;
    case "cms-entry": {
      const { collectionId, entryId } = parseCmsEntryResourceId(
        input.item.resourceId,
      );
      await input.targetAdapter.deleteEntry(collectionId, entryId);
      await removeCmsEntrySearchDocuments(input.targetAdapter, entryId);
      return;
    }
    case "snapshot":
      throw new Error(
        "Snapshot sync is no longer supported in the runtime delivery path",
      );
    case "styles":
    case "site-settings":
    case "order":
    case "metadata":
      throw new Error(
        `Delete is not supported for content resource type: ${input.item.resourceType}`,
      );
  }
}

export class ContentSyncExecutor {
  async apply(
    input: ContentSyncExecutorInput,
  ): Promise<ContentSyncExecutorResult> {
    const sourceAdapter = getSourceAdapter(input);
    const targetAdapter = getTargetAdapter(input);
    const summary = summarizeResults(input.dryRunItems.length);
    const items: ContentSyncHistoryItem[] = [];
    let hasAppliedMutation = false;

    for (const item of input.dryRunItems) {
      const createdAt = new Date().toISOString();

      if (item.action === "skip") {
        summary.skipped += 1;
        items.push({ ...item, resultStatus: "skipped", createdAt });
        continue;
      }

      if (item.action === "conflict") {
        summary.conflicted += 1;
        items.push({
          ...item,
          resultStatus: "conflicted",
          conflictReason:
            item.conflictReason ??
            item.errorMessage ??
            "Conflict requires manual resolution",
          createdAt,
        });
        continue;
      }

      try {
        if (item.action === "delete") {
          await applyDelete({ item, targetAdapter });
          summary.deleted += 1;
        } else {
          await applyCreateOrUpdate({
            direction: input.dryRunJob.direction,
            item,
            sourceAdapter,
            targetAdapter,
            authorship: input.authorship,
          });
          if (item.action === "create") summary.created += 1;
          if (item.action === "update") summary.updated += 1;
        }

        hasAppliedMutation = true;
        items.push({ ...item, resultStatus: "applied", createdAt });
      } catch (error) {
        summary.failed += 1;
        items.push({
          ...item,
          resultStatus: mapToResultStatus({
            action: item.action,
            error: "failed",
          }),
          errorMessage: error instanceof Error ? error.message : String(error),
          createdAt,
        });
      }
    }

    if (hasAppliedMutation) {
      await targetAdapter.touchContentRevision({
        mutationKind: input.dryRunJob.direction,
        mutationTarget: input.dryRunJob.targetEndpointId,
        updatedBy: input.actorId,
      });
    }

    const [localState, remoteState] = await Promise.all([
      input.localAdapter.getContentSiteState(),
      input.remoteAdapter.getContentSiteState(),
    ]);

    return {
      summary,
      items,
      localState,
      remoteState,
    };
  }
}

export function createContentSyncApplyResponseData(input: {
  job: ContentSyncJob;
  items: readonly ContentSyncHistoryItem[];
  summary: ContentSyncSummary;
  localState: ContentSiteState | null;
  remoteState: ContentSiteState | null;
}) {
  return {
    job: input.job,
    items: [...input.items],
    summary: input.summary,
    localRevision: toContentSyncRevisionSnapshot(input.localState),
    remoteRevision: toContentSyncRevisionSnapshot(input.remoteState),
  };
}
