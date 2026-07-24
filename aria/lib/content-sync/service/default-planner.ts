import { computeChecksum } from "../../registry/verification";
import type {
  OrderKind,
  SiteSettings,
  StorageAdapter,
  UniversalDesignSystem,
} from "../../storage/adapter";
import type { AriaCollection, AriaEntryRecord } from "../../cms/types";
import type { ComponentDSL, LayoutDSL, PageDSL } from "../../types/nodes";
import type {
  ContentSyncPlanItem,
  ContentSyncResourceState,
  ContentSyncResourceType,
} from "../schema";
import {
  ContentSyncPlanner,
  type ContentSyncPlannerCollectPairsInput,
  type ContentSyncPlannerComparePairInput,
  type ContentSyncPlannerResourcePair,
} from "./planner";

type ResourceMap = Map<string, ContentSyncResourceState>;

function resourceKey(
  resourceType: ContentSyncResourceType,
  resourceId: string,
) {
  return `${resourceType}:${resourceId}`;
}

function resourceTransferRank(resourceType: ContentSyncResourceType): number {
  switch (resourceType) {
    case "layout":
      return 0;
    case "page":
      return 1;
    case "layout-locale":
      return 2;
    case "page-locale":
      return 3;
    default:
      return -1;
  }
}

/** A reversible resource id that cannot collide with page/layout ids. */
function localizedResourceId(ownerId: string, locale: string): string {
  return `${encodeURIComponent(ownerId)}|${locale}`;
}

function cmsEntryResourceId(collectionId: string, entryId: string): string {
  return `${collectionId}/${entryId}`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};

    for (const key of Object.keys(record).sort()) {
      output[key] = canonicalize(record[key]);
    }

    return output;
  }

  return value;
}

function toCanonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

async function toChecksum(value: unknown): Promise<string> {
  return computeChecksum(toCanonicalJson(value));
}

function toIsoDate(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp)
      ? new Date(timestamp).toISOString()
      : value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  return undefined;
}

function versionFromDsl(
  input: Pick<
    PageDSL | LayoutDSL | ComponentDSL,
    "version" | "updatedAt" | "createdAt"
  >,
): string | undefined {
  return input.version ?? input.updatedAt ?? input.createdAt;
}

function timestampFromDsl(
  input: Pick<PageDSL | LayoutDSL | ComponentDSL, "updatedAt" | "createdAt">,
): string | undefined {
  return toIsoDate(input.updatedAt) ?? toIsoDate(input.createdAt);
}

function toTimestamp(value?: string): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function resolveUpdateOrSkip(
  direction: "push" | "pull",
  conflictPolicy: "manual" | "newest-wins" | "local-wins" | "remote-wins",
  source: ContentSyncResourceState,
  target: ContentSyncResourceState,
): Pick<ContentSyncPlanItem, "action" | "reason"> {
  if (conflictPolicy === "manual") {
    return { action: "conflict", reason: "manual-conflict-required" };
  }

  if (conflictPolicy === "local-wins") {
    return direction === "push"
      ? { action: "update", reason: "local-wins-source-overwrites-target" }
      : { action: "skip", reason: "local-wins-target-preserved" };
  }

  if (conflictPolicy === "remote-wins") {
    return direction === "pull"
      ? { action: "update", reason: "remote-wins-source-overwrites-target" }
      : { action: "skip", reason: "remote-wins-target-preserved" };
  }

  const sourceTimestamp = toTimestamp(source.updatedAt);
  const targetTimestamp = toTimestamp(target.updatedAt);

  if (sourceTimestamp !== null && targetTimestamp !== null) {
    if (sourceTimestamp > targetTimestamp) {
      return { action: "update", reason: "newest-wins-source-newer" };
    }

    if (sourceTimestamp < targetTimestamp) {
      return { action: "skip", reason: "newest-wins-target-newer" };
    }
  }

  return { action: "conflict", reason: "newest-wins-insufficient-timestamp" };
}

function resolveDeleteOrSkip(
  direction: "push" | "pull",
  conflictPolicy: "manual" | "newest-wins" | "local-wins" | "remote-wins",
): Pick<ContentSyncPlanItem, "action" | "reason"> {
  if (conflictPolicy === "manual") {
    return { action: "conflict", reason: "manual-delete-conflict" };
  }

  if (conflictPolicy === "local-wins") {
    return direction === "push"
      ? { action: "delete", reason: "local-wins-source-delete" }
      : { action: "skip", reason: "local-wins-delete-skipped" };
  }

  if (conflictPolicy === "remote-wins") {
    return direction === "pull"
      ? { action: "delete", reason: "remote-wins-source-delete" }
      : { action: "skip", reason: "remote-wins-delete-skipped" };
  }

  return { action: "conflict", reason: "newest-wins-delete-requires-manual" };
}

async function createResourceState(input: {
  resourceType: ContentSyncResourceType;
  resourceId: string;
  resourceLabel?: string;
  version?: string;
  updatedAt?: string;
  value: unknown;
}): Promise<ContentSyncResourceState> {
  return {
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    resourceLabel: input.resourceLabel,
    version: input.version,
    checksum: await toChecksum(input.value),
    exists: true,
    updatedAt: input.updatedAt,
  };
}

async function collectPageResources(
  adapter: StorageAdapter,
  requestedTypes: Set<ContentSyncResourceType>,
): Promise<ResourceMap> {
  const resources: ResourceMap = new Map();

  if (!requestedTypes.has("page") && !requestedTypes.has("metadata")) {
    return resources;
  }

  const pages = await adapter.listPagesDSL();

  if (requestedTypes.has("page")) {
    const pageStates = await Promise.all(
      pages.map(async (page) => {
        const dsl = await adapter.getPageDSL(page.id);
        if (!dsl) {
          return null;
        }

        const state = await createResourceState({
          resourceType: "page",
          resourceId: page.id,
          resourceLabel: page.title ?? dsl.title,
          version: versionFromDsl(dsl),
          updatedAt: timestampFromDsl(dsl),
          value: dsl,
        });

        return [resourceKey("page", page.id), state] as const;
      }),
    );

    for (const entry of pageStates) {
      if (entry) {
        resources.set(entry[0], entry[1]);
      }
    }
  }

  if (requestedTypes.has("metadata")) {
    const metadataStates = await Promise.all(
      pages.map(async (page) => {
        const pageSlug = page.slug ?? page.id;
        const metadata = await adapter.getPageMetadata(pageSlug);

        if (!metadata) {
          return null;
        }

        const state = await createResourceState({
          resourceType: "metadata",
          resourceId: pageSlug,
          resourceLabel: `${page.title} metadata`,
          version: page.updatedAt,
          updatedAt: timestampFromDsl(page),
          value: metadata,
        });

        return [resourceKey("metadata", pageSlug), state] as const;
      }),
    );

    for (const entry of metadataStates) {
      if (entry) {
        resources.set(entry[0], entry[1]);
      }
    }
  }

  return resources;
}

async function collectLayoutResources(
  adapter: StorageAdapter,
): Promise<ResourceMap> {
  const resources: ResourceMap = new Map();
  const layouts = await adapter.listLayoutsDSL();

  const states = await Promise.all(
    layouts.map(async (layout) => {
      const state = await createResourceState({
        resourceType: "layout",
        resourceId: layout.id,
        resourceLabel: layout.title ?? layout.name,
        version: versionFromDsl(layout),
        updatedAt: timestampFromDsl(layout),
        value: layout,
      });

      return [resourceKey("layout", layout.id), state] as const;
    }),
  );

  for (const [key, state] of states) {
    resources.set(key, state);
  }

  return resources;
}

async function collectPageLocaleResources(
  adapter: StorageAdapter,
): Promise<ResourceMap> {
  const resources: ResourceMap = new Map();
  const records = await adapter.listPageLocaleRecords();
  const states = await Promise.all(
    records.map(async (record) => {
      const resourceId = localizedResourceId(
        record.meta.pageId,
        record.meta.locale,
      );
      const state = await createResourceState({
        resourceType: "page-locale",
        resourceId,
        resourceLabel: `${record.meta.pageId} (${record.meta.locale})`,
        version: record.meta.currentVersion,
        updatedAt: record.meta.updatedAt,
        value: record,
      });
      return [resourceKey("page-locale", resourceId), state] as const;
    }),
  );
  for (const [key, state] of states) {
    resources.set(key, state);
  }
  return resources;
}

async function collectLayoutLocaleResources(
  adapter: StorageAdapter,
): Promise<ResourceMap> {
  const resources: ResourceMap = new Map();
  const records = await adapter.listLayoutLocaleRecords();
  const states = await Promise.all(
    records.map(async (record) => {
      const resourceId = localizedResourceId(
        record.meta.layoutId,
        record.meta.locale,
      );
      const state = await createResourceState({
        resourceType: "layout-locale",
        resourceId,
        resourceLabel: `${record.meta.layoutId} (${record.meta.locale})`,
        version: record.meta.currentVersion,
        updatedAt: record.meta.updatedAt,
        value: record,
      });
      return [resourceKey("layout-locale", resourceId), state] as const;
    }),
  );
  for (const [key, state] of states) {
    resources.set(key, state);
  }
  return resources;
}

async function collectComponentResources(
  adapter: StorageAdapter,
): Promise<ResourceMap> {
  const resources: ResourceMap = new Map();
  const components = await adapter.listComponentsDSL();

  const states = await Promise.all(
    components.map(async (component) => {
      const state = await createResourceState({
        resourceType: "component",
        resourceId: component.id,
        resourceLabel: component.title ?? component.name,
        version: versionFromDsl(component),
        updatedAt: timestampFromDsl(component),
        value: component,
      });

      return [resourceKey("component", component.id), state] as const;
    }),
  );

  for (const [key, state] of states) {
    resources.set(key, state);
  }

  return resources;
}

async function collectSingletonResource(
  resourceType: "styles" | "site-settings",
  value: UniversalDesignSystem | SiteSettings | null,
  label: string,
): Promise<ResourceMap> {
  const resources: ResourceMap = new Map();

  if (!value) {
    return resources;
  }

  let version: string | undefined;
  let updatedAt: string | undefined;

  if (resourceType === "styles") {
    const designSystem = value as UniversalDesignSystem;
    version =
      designSystem.artifacts.globalCSSHash ||
      designSystem.artifacts.lastCompiled ||
      undefined;
    updatedAt = toIsoDate(designSystem.artifacts.lastCompiled);
  } else {
    const siteSettings = value as SiteSettings;
    version = toIsoDate(siteSettings.updated_at);
    updatedAt = toIsoDate(siteSettings.updated_at);
  }

  const state = await createResourceState({
    resourceType,
    resourceId: "default",
    resourceLabel: label,
    version,
    updatedAt,
    value,
  });

  resources.set(resourceKey(resourceType, "default"), state);
  return resources;
}

async function collectOrderResources(
  adapter: StorageAdapter,
): Promise<ResourceMap> {
  const resources: ResourceMap = new Map();
  const orderKinds: readonly OrderKind[] = ["pages", "layouts", "components"];

  const states = await Promise.all(
    orderKinds.map(async (kind) => {
      const order = await adapter.getOrder(kind);
      const state = await createResourceState({
        resourceType: "order",
        resourceId: kind,
        resourceLabel: `${kind} order`,
        updatedAt: undefined,
        value: order,
      });

      return [resourceKey("order", kind), state] as const;
    }),
  );

  for (const [key, state] of states) {
    resources.set(key, state);
  }

  return resources;
}

async function listAllCmsEntries(
  adapter: StorageAdapter,
  collectionId: string,
): Promise<AriaEntryRecord[]> {
  const limit = 200;
  const records: AriaEntryRecord[] = [];

  for (let page = 1; ; page += 1) {
    const result = await adapter.listEntries({
      collectionId,
      page,
      limit,
      sort: [{ field: "updatedAt", direction: "asc" }],
    });

    for (const item of result.items) {
      const record = await adapter.getEntry({
        collectionId,
        idOrSlug: item.entry.id,
        includeRelations: true,
      });
      if (record) {
        records.push(record);
      }
    }

    if (records.length >= result.total || result.items.length === 0) {
      return records;
    }
  }
}

async function collectCmsCollectionResources(
  adapter: StorageAdapter,
): Promise<ResourceMap> {
  const resources: ResourceMap = new Map();
  const collections = await adapter.listCollections();

  const states = await Promise.all(
    collections.map(async (collection: AriaCollection) => {
      const state = await createResourceState({
        resourceType: "cms-collection",
        resourceId: collection.id,
        resourceLabel: collection.label,
        version: collection.updatedAt,
        updatedAt: toIsoDate(collection.updatedAt),
        value: collection,
      });

      return [resourceKey("cms-collection", collection.id), state] as const;
    }),
  );

  for (const [key, state] of states) {
    resources.set(key, state);
  }

  return resources;
}

async function collectCmsEntryResources(
  adapter: StorageAdapter,
): Promise<ResourceMap> {
  const resources: ResourceMap = new Map();
  const collections = await adapter.listCollections();
  const collectionEntries = await Promise.all(
    collections.map((collection) => listAllCmsEntries(adapter, collection.id)),
  );

  const states = await Promise.all(
    collectionEntries.flat().map(async (record) => {
      const sourceLocale =
        record.locales.find((locale) => locale.isSource) ?? record.locales[0];
      const resourceId = cmsEntryResourceId(
        record.entry.collectionId,
        record.entry.id,
      );
      const state = await createResourceState({
        resourceType: "cms-entry",
        resourceId,
        resourceLabel: sourceLocale?.title || record.entry.id,
        version: record.entry.version,
        updatedAt: toIsoDate(record.entry.updatedAt),
        value: record,
      });

      return [resourceKey("cms-entry", resourceId), state] as const;
    }),
  );

  for (const [key, state] of states) {
    resources.set(key, state);
  }

  return resources;
}

async function collectAdapterResources(
  adapter: StorageAdapter,
  resourceTypes: readonly ContentSyncResourceType[],
): Promise<ResourceMap> {
  const requestedTypes = new Set(resourceTypes);
  const resources: ResourceMap = new Map();

  const pageResources = await collectPageResources(adapter, requestedTypes);
  for (const [key, value] of pageResources) {
    resources.set(key, value);
  }

  if (requestedTypes.has("layout")) {
    const layoutResources = await collectLayoutResources(adapter);
    for (const [key, value] of layoutResources) {
      resources.set(key, value);
    }
  }

  if (requestedTypes.has("page-locale")) {
    const pageLocaleResources = await collectPageLocaleResources(adapter);
    for (const [key, value] of pageLocaleResources) {
      resources.set(key, value);
    }
  }

  if (requestedTypes.has("layout-locale")) {
    const layoutLocaleResources = await collectLayoutLocaleResources(adapter);
    for (const [key, value] of layoutLocaleResources) {
      resources.set(key, value);
    }
  }

  if (requestedTypes.has("component")) {
    const componentResources = await collectComponentResources(adapter);
    for (const [key, value] of componentResources) {
      resources.set(key, value);
    }
  }

  if (requestedTypes.has("styles")) {
    const stylesResources = await collectSingletonResource(
      "styles",
      await adapter.getDesignSystem(),
      "Design system",
    );
    for (const [key, value] of stylesResources) {
      resources.set(key, value);
    }
  }

  if (requestedTypes.has("site-settings")) {
    const settingsResources = await collectSingletonResource(
      "site-settings",
      await adapter.getSiteSettings(),
      "Site settings",
    );
    for (const [key, value] of settingsResources) {
      resources.set(key, value);
    }
  }

  if (requestedTypes.has("cms-collection")) {
    const collectionResources = await collectCmsCollectionResources(adapter);
    for (const [key, value] of collectionResources) {
      resources.set(key, value);
    }
  }

  if (requestedTypes.has("cms-entry")) {
    const entryResources = await collectCmsEntryResources(adapter);
    for (const [key, value] of entryResources) {
      resources.set(key, value);
    }
  }

  if (requestedTypes.has("order")) {
    const orderResources = await collectOrderResources(adapter);
    for (const [key, value] of orderResources) {
      resources.set(key, value);
    }
  }

  return resources;
}

export class DefaultContentSyncPlanner extends ContentSyncPlanner {
  protected async collectResourcePairs(
    input: ContentSyncPlannerCollectPairsInput,
  ): Promise<readonly ContentSyncPlannerResourcePair[]> {
    const [localResources, remoteResources] = await Promise.all([
      collectAdapterResources(input.localAdapter, input.request.resourceTypes),
      collectAdapterResources(input.remoteAdapter, input.request.resourceTypes),
    ]);

    const keys = new Set([...localResources.keys(), ...remoteResources.keys()]);
    const pairs: ContentSyncPlannerResourcePair[] = [];

    for (const key of [...keys].sort((left, right) => {
      const leftResource = localResources.get(left) ?? remoteResources.get(left);
      const rightResource =
        localResources.get(right) ?? remoteResources.get(right);
      const leftRank = resourceTransferRank(leftResource!.resourceType);
      const rightRank = resourceTransferRank(rightResource!.resourceType);
      if (leftRank < 0 && rightRank < 0) return left.localeCompare(right);
      return leftRank - rightRank || left.localeCompare(right);
    })) {
      const local = localResources.get(key) ?? null;
      const remote = remoteResources.get(key) ?? null;

      if (!local && !remote) {
        continue;
      }

      pairs.push(
        this.createResourcePair({
          resourceType: (local ?? remote)!.resourceType,
          resourceId: (local ?? remote)!.resourceId,
          resourceLabel: local?.resourceLabel ?? remote?.resourceLabel,
          local,
          remote,
        }),
      );
    }

    return this.filterResourcePairs(pairs, input.request.resourceTypes);
  }

  protected comparePair(
    input: ContentSyncPlannerComparePairInput,
  ): ContentSyncPlanItem {
    const source =
      input.request.direction === "push" ? input.pair.local : input.pair.remote;
    const target =
      input.request.direction === "push" ? input.pair.remote : input.pair.local;

    if (source && !target) {
      return this.createPlanItem({
        resourceType: input.pair.resourceType,
        resourceId: input.pair.resourceId,
        resourceLabel: input.pair.resourceLabel,
        action: "create",
        reason: "target-missing",
        localVersion: input.pair.local?.version,
        remoteVersion: input.pair.remote?.version,
        localChecksum: input.pair.local?.checksum,
        remoteChecksum: input.pair.remote?.checksum,
      });
    }

    if (!source && target) {
      const resolution = resolveDeleteOrSkip(
        input.request.direction,
        input.request.conflictPolicy,
      );

      return this.createPlanItem({
        resourceType: input.pair.resourceType,
        resourceId: input.pair.resourceId,
        resourceLabel: input.pair.resourceLabel,
        action: resolution.action,
        reason: resolution.reason,
        localVersion: input.pair.local?.version,
        remoteVersion: input.pair.remote?.version,
        localChecksum: input.pair.local?.checksum,
        remoteChecksum: input.pair.remote?.checksum,
      });
    }

    if (!source || !target) {
      return this.createPlanItem({
        resourceType: input.pair.resourceType,
        resourceId: input.pair.resourceId,
        resourceLabel: input.pair.resourceLabel,
        action: "skip",
        reason: "resource-unavailable",
        localVersion: input.pair.local?.version,
        remoteVersion: input.pair.remote?.version,
        localChecksum: input.pair.local?.checksum,
        remoteChecksum: input.pair.remote?.checksum,
      });
    }

    if (
      source.checksum &&
      target.checksum &&
      source.checksum === target.checksum
    ) {
      return this.createPlanItem({
        resourceType: input.pair.resourceType,
        resourceId: input.pair.resourceId,
        resourceLabel: input.pair.resourceLabel,
        action: "skip",
        reason: "same-checksum",
        localVersion: input.pair.local?.version,
        remoteVersion: input.pair.remote?.version,
        localChecksum: input.pair.local?.checksum,
        remoteChecksum: input.pair.remote?.checksum,
      });
    }

    const resolution = resolveUpdateOrSkip(
      input.request.direction,
      input.request.conflictPolicy,
      source,
      target,
    );

    return this.createPlanItem({
      resourceType: input.pair.resourceType,
      resourceId: input.pair.resourceId,
      resourceLabel: input.pair.resourceLabel,
      action: resolution.action,
      reason: resolution.reason,
      localVersion: input.pair.local?.version,
      remoteVersion: input.pair.remote?.version,
      localChecksum: input.pair.local?.checksum,
      remoteChecksum: input.pair.remote?.checksum,
    });
  }
}
