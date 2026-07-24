import { generateId } from "../../crypto";
import { z } from "zod";
import {
  AriaEntryRecordSchema,
  type CreateEntryRequestSchema,
  type UpdateEntryRequestSchema,
} from "../schemas";
import { cmsActorFromAuthorship } from "../authorship";
import { CmsServiceError } from "../errors";
import { validateEntryFrontmatter } from "../schema/compiler";
import { collectionSchemaForEntryFrontmatter } from "../systemFields";
import { loadCollectionsForHydration } from "../hydrateEntryFields";
import { resolveCmsListFilter, type CmsListFilter } from "../listFilters";
import { getCollectionFromAdapter } from "./collections";
import {
  removeCmsEntrySearchDocuments,
  syncCmsEntrySearchDocuments,
} from "./search";
import type {
  AriaEntryRecord,
  AriaEntryRevision,
  AriaEntrySnapshot,
  AriaEntryRelation,
  CmsAuditEvent,
  FieldSchema,
} from "../schemas";
import type {
  EntryListParams,
  EntryListResult,
  EntryQueryParams,
} from "../constants";
import type { ActorRef } from "../../auth/types";
import type { StorageAdapter } from "../../storage/adapter";
import { slugify } from "../../utils/slugify";
import { buildCmsEntryPublicPath } from "../publicPaths";
import {
  normalizeContentLocalization,
  resolveContentLocale,
  resolveContentLocaleChain,
  type ContentLocalizationSettings,
} from "../../localization/contentLocale";
import { localizePublicPath } from "../../localization/publicRoutes";
import { normalizeLocalizedRoute } from "../../localization/siteTranslations";
import type { ApiMutationActionContext } from "../../api/mutationContext";
import { normalizeEntryRecordForStorage } from "../storage/entryMutation";
import {
  createIntegrationEvent,
  hashIntegrationSnapshot,
  type IntegrationEventCommit,
  type IntegrationEventType,
} from "../../integrations/events";

type CreateEntryInput = z.infer<typeof CreateEntryRequestSchema>;
type UpdateEntryInput = z.infer<typeof UpdateEntryRequestSchema>;

export type EntryMutationCommandOptions = {
  auditEventFor(record: AriaEntryRecord): CmsAuditEvent;
  apiContext?: ApiMutationActionContext;
  eventSource?: import("../../integrations/events").IntegrationEventSource;
  onIntegrationEventCommitted?(
    event: IntegrationEventCommit,
  ): Promise<void> | void;
};

const EntryQueryFilterSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    slug: z.string().trim().min(1).optional(),
    relationIncludes: z
      .object({
        field: z.string().trim().min(1),
        entryId: z.string().trim().min(1),
      })
      .strict()
      .optional(),
    referenceEquals: z
      .object({
        field: z.string().trim().min(1),
        entryId: z.string().trim().min(1),
      })
      .strict()
      .optional(),
  })
  .strict();

function nowIso(): string {
  return new Date().toISOString();
}

export async function getContentLocaleSettings(
  adapter: StorageAdapter,
): Promise<ContentLocalizationSettings> {
  if (typeof adapter.getSiteSettings !== "function") {
    return normalizeContentLocalization(undefined);
  }
  const settings = await adapter.getSiteSettings();
  return normalizeContentLocalization(settings?.localization?.content);
}

export async function resolveEntryLocaleFromAdapter(
  adapter: StorageAdapter,
  record: AriaEntryRecord,
  requestedLocale?: string,
) {
  return resolveContentLocale(
    record.locales,
    await getContentLocaleSettings(adapter),
    requestedLocale,
  );
}

function resolveLocale(
  locale: string | undefined,
  settings: ContentLocalizationSettings,
): string {
  return locale?.trim() || settings.defaultLocale;
}

function assertWritableLocale(
  locale: string,
  settings: ContentLocalizationSettings,
  existingLocales: readonly { locale: string }[] = [],
): void {
  const configured = settings.locales.find((item) => item.code === locale);
  if (
    configured?.enabled ||
    existingLocales.some((item) => item.locale === locale)
  ) {
    return;
  }
  throw new CmsServiceError(
    "VALIDATION_ERROR",
    `Locale is not enabled for content editing: ${locale}`,
  );
}

async function assertPublishedCmsEntryRoutesAvailable(input: {
  adapter: StorageAdapter;
  collection: Awaited<ReturnType<typeof getCollectionFromAdapter>>;
  record: AriaEntryRecord;
  settings: ContentLocalizationSettings;
}): Promise<void> {
  const { collection, record, settings } = input;
  if (!collection.templatePageId || !collection.urlPattern) return;
  const redirects = await input.adapter.listRedirects({
    includeDisabled: false,
  });
  for (const entryLocale of record.locales) {
    const configured = settings.locales.find(
      (locale) => locale.code === entryLocale.locale && locale.enabled,
    );
    if (!configured) continue;
    const pathname = buildCmsEntryPublicPath(
      collection.urlPattern,
      entryLocale.slug,
    );
    if (!pathname) continue;
    const normalized = normalizeLocalizedRoute(pathname);
    if (entryLocale.locale !== settings.defaultLocale) {
      const page = await input.adapter.resolvePublishedPageLocale(
        entryLocale.locale,
        normalized.pathnameKey,
      );
      if (page) {
        throw new CmsServiceError(
          "CONFLICT",
          `CMS entry route conflicts with localized page route ${pathname}.`,
        );
      }
    }
    const publicPath = localizePublicPath({
      pathname: normalized.pathname,
      locale: entryLocale.locale,
      settings,
    });
    const publicKey = normalizeLocalizedRoute(publicPath).pathnameKey;
    if (
      redirects.some((redirect) => {
        try {
          return (
            normalizeLocalizedRoute(redirect.fromPath).pathnameKey === publicKey
          );
        } catch {
          return false;
        }
      })
    ) {
      throw new CmsServiceError(
        "CONFLICT",
        `CMS entry route conflicts with enabled redirect source ${publicPath}.`,
      );
    }
  }
}

function nextVersion(): string {
  return generateId();
}

function assertFutureScheduledFor(scheduledFor: string): void {
  if (Date.parse(scheduledFor) <= Date.now()) {
    throw new CmsServiceError(
      "VALIDATION_ERROR",
      "scheduledFor must be in the future",
    );
  }
}

export function assertScheduleInvariant(input: {
  status: AriaEntryRecord["entry"]["status"];
  scheduledFor: string | null;
}): void {
  if (input.status === "scheduled") {
    if (!input.scheduledFor) {
      throw new CmsServiceError(
        "VALIDATION_ERROR",
        "Scheduled entries require scheduledFor",
      );
    }
    assertFutureScheduledFor(input.scheduledFor);
  }
}

function allowsIncompleteFrontmatter(
  status: AriaEntryRecord["entry"]["status"],
): boolean {
  return status === "draft" || status === "archived";
}

function validateFrontmatterForStatus(
  collection: Awaited<ReturnType<typeof getCollectionFromAdapter>>,
  frontmatter: Record<string, unknown>,
  status: AriaEntryRecord["entry"]["status"],
): void {
  const frontmatterValidation = validateEntryFrontmatter(
    collectionSchemaForEntryFrontmatter(collection),
    frontmatter,
    { allowMissingRequired: allowsIncompleteFrontmatter(status) },
  );
  if (!frontmatterValidation.success) {
    throw new CmsServiceError(
      "VALIDATION_ERROR",
      frontmatterValidation.errors.join("; "),
    );
  }
}

function validateRelationsForStatus(
  collection: Awaited<ReturnType<typeof getCollectionFromAdapter>>,
  relations: readonly AriaEntryRelation[] | undefined,
  status: AriaEntryRecord["entry"]["status"],
): void {
  if (allowsIncompleteFrontmatter(status)) {
    return;
  }

  const relationFields = collection.schema.fields.filter(
    (field) => field.type === "relation" && field.required === true,
  );
  if (relationFields.length === 0) {
    return;
  }

  const relationCounts = new Map<string, number>();
  for (const relation of relations ?? []) {
    relationCounts.set(
      relation.fieldKey,
      (relationCounts.get(relation.fieldKey) ?? 0) + 1,
    );
  }

  const missing = relationFields.filter(
    (field) => (relationCounts.get(field.key) ?? 0) === 0,
  );
  if (missing.length > 0) {
    throw new CmsServiceError(
      "VALIDATION_ERROR",
      missing
        .map((field) => `${field.key}: Relation requires at least one entry`)
        .join("; "),
    );
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeFrontmatterForFields(
  fields: readonly FieldSchema[],
  frontmatter: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const field of fields) {
    if (field.type === "relation") {
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(frontmatter, field.key)) {
      continue;
    }

    const value = frontmatter[field.key];
    if (field.type === "object") {
      if (isPlainRecord(value)) {
        sanitized[field.key] = sanitizeFrontmatterForFields(
          field.fields ?? [],
          value,
        );
      }
      continue;
    }
    if (field.type === "repeater") {
      if (Array.isArray(value)) {
        sanitized[field.key] = value
          .filter(isPlainRecord)
          .map((item) =>
            sanitizeFrontmatterForFields(field.fields ?? [], item),
          );
      }
      continue;
    }

    sanitized[field.key] = value;
  }

  return sanitized;
}

function sanitizeFrontmatterForCollection(
  collection: Awaited<ReturnType<typeof getCollectionFromAdapter>>,
  frontmatter: Record<string, unknown>,
): Record<string, unknown> {
  return sanitizeFrontmatterForFields(
    collectionSchemaForEntryFrontmatter(collection).fields,
    frontmatter,
  );
}

async function assertUniqueSlug(
  adapter: StorageAdapter,
  collectionId: string,
  locale: string,
  slug: string,
  excludeEntryId?: string,
): Promise<void> {
  const existing = await adapter.getEntry({
    collectionId,
    idOrSlug: slug,
    locale,
  });
  if (existing && existing.entry.id !== excludeEntryId) {
    throw new CmsServiceError(
      "CONFLICT",
      `Slug already exists in ${locale}: ${slug}`,
    );
  }
}

function buildSnapshot(record: AriaEntryRecord): AriaEntrySnapshot {
  return {
    entry: { ...record.entry },
    locales: record.locales.map((locale) => ({ ...locale })),
    relations: record.relations?.map(
      (relation): AriaEntryRelation => ({ ...relation }),
    ),
  };
}

export function buildEntryRevision(
  record: AriaEntryRecord,
  actor: ActorRef,
  message?: string,
): AriaEntryRevision {
  const actorDisplay = cmsActorFromAuthorship(actor);
  const revision: AriaEntryRevision = {
    id: generateId(),
    entryId: record.entry.id,
    locale: record.locales.find((locale) => locale.isSource)?.locale ?? null,
    version: record.entry.version,
    snapshot: buildSnapshot(record),
    actorId: actorDisplay.id,
    message,
    createdAt: nowIso(),
    authorship: {
      actor: actorDisplay,
    },
  };
  return revision;
}

async function saveRevision(
  adapter: StorageAdapter,
  record: AriaEntryRecord,
  actor: ActorRef,
  message?: string,
): Promise<AriaEntryRevision> {
  return adapter.saveEntryRevision(buildEntryRevision(record, actor, message));
}

async function commitEntryMutation(
  adapter: StorageAdapter,
  input: {
    record: AriaEntryRecord;
    expectedVersion?: string;
    relations?: AriaEntryRecord["relations"];
    revision: AriaEntryRevision;
    command: EntryMutationCommandOptions;
  },
): Promise<AriaEntryRecord> {
  const record = normalizeEntryRecordForStorage(input.record);
  const api = input.command.apiContext?.prepare(record);
  const eventTypeByAction: Record<string, IntegrationEventType> = {
    "entry.create": "cms.entry.created.v1",
    "entry.update":
      record.entry.status === "published"
        ? "cms.entry.updated_published.v1"
        : "cms.entry.updated.v1",
    "entry.publish": "cms.entry.published.v1",
    "entry.unpublish": "cms.entry.unpublished.v1",
    "entry.archive": "cms.entry.archived.v1",
    "entry.restore_revision":
      record.entry.status === "published"
        ? "cms.entry.updated_published.v1"
        : "cms.entry.updated.v1",
  };
  const auditEvent = input.command.auditEventFor(record);
  const eventType =
    record.entry.status === "scheduled"
      ? undefined
      : eventTypeByAction[auditEvent.action];
  const sourceLocale =
    record.locales.find((locale) => locale.isSource) ?? record.locales[0];
  const publishedSnapshot =
    eventType === "cms.entry.published.v1" ||
    eventType === "cms.entry.updated_published.v1"
      ? {
          entry: {
            id: record.entry.id,
            collectionId: record.entry.collectionId,
            version: record.entry.version,
            publishedAt: record.entry.publishedAt,
          },
          locale: sourceLocale
            ? {
                locale: sourceLocale.locale,
                title: sourceLocale.title,
                slug: sourceLocale.slug,
                body: sourceLocale.body,
              }
            : null,
        }
      : null;
  const integrationEvent = eventType
    ? createIntegrationEvent({
        type: eventType,
        aggregateType: "cms.entry",
        aggregateId: record.entry.id,
        aggregateVersion: record.entry.version,
        actorId: auditEvent.actorId,
        source: input.command.eventSource ?? (api ? "site_api" : "studio"),
        requestId: api?.securityAudit.requestId ?? auditEvent.id,
        occurredAt: auditEvent.createdAt,
        payload: {
          entryId: record.entry.id,
          collectionId: record.entry.collectionId,
          version: record.entry.version,
          status: record.entry.status,
        },
        snapshot: publishedSnapshot,
        snapshotSha256: publishedSnapshot
          ? await hashIntegrationSnapshot(publishedSnapshot)
          : null,
      })
    : undefined;
  let saved: AriaEntryRecord;
  try {
    saved = await adapter.commitCmsEntryMutation({
      record,
      expectedVersion: input.expectedVersion,
      relations: input.relations,
      revision: input.revision,
      auditEvent,
      api,
      integrationEvent,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("version conflict")) {
      throw new CmsServiceError("CONFLICT", error.message);
    }
    throw error;
  }
  if (api) input.command.apiContext?.markCommitted(api.response);
  if (integrationEvent) {
    await input.command.onIntegrationEventCommitted?.(integrationEvent);
  }
  return saved;
}

export async function listEntriesFromAdapter(
  adapter: StorageAdapter,
  params: EntryListParams,
): Promise<EntryListResult> {
  await getCollectionFromAdapter(adapter, params.collectionId);
  const settings = await getContentLocaleSettings(adapter);
  const locale = resolveLocale(params.locale, settings);
  return adapter.listEntries({
    ...params,
    locale,
    localeFallbacks: resolveContentLocaleChain(settings, locale),
  });
}

async function resolveQueryListFilter(
  adapter: StorageAdapter,
  params: EntryQueryParams,
): Promise<CmsListFilter | undefined> {
  const rawFilter = params.filter;
  if (!rawFilter || Object.keys(rawFilter).length === 0) {
    return undefined;
  }

  const collection = await getCollectionFromAdapter(
    adapter,
    params.collectionId,
  );
  const collections = await loadCollectionsForHydration(adapter);
  return resolveCmsListFilter({
    collection,
    rawFilter,
    entryContext: params.entryContext,
    collections,
  });
}

export async function queryEntriesFromAdapter(
  adapter: StorageAdapter,
  params: EntryQueryParams,
): Promise<EntryListResult> {
  await getCollectionFromAdapter(adapter, params.collectionId);
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;
  const page = Math.floor(offset / limit) + 1;
  const rawFilter = EntryQueryFilterSchema.parse(params.filter ?? {});
  const settings = await getContentLocaleSettings(adapter);
  const locale = resolveLocale(params.locale, settings);
  const filter = await resolveQueryListFilter(adapter, params);
  const idOrSlug = filter?.id ?? filter?.slug ?? rawFilter.id ?? rawFilter.slug;
  const hasArchiveFilter = Boolean(
    filter?.relationIncludes ||
    filter?.referenceEquals ||
    rawFilter.relationIncludes ||
    rawFilter.referenceEquals,
  );
  if (idOrSlug && !hasArchiveFilter) {
    const record = await getEntryFromAdapter(adapter, {
      collectionId: params.collectionId,
      idOrSlug,
      locale,
      include: params.include,
    });
    const statuses = Array.isArray(params.status)
      ? params.status
      : params.status
        ? [params.status]
        : null;
    const matchesStatus =
      !record || !statuses ? true : statuses.includes(record.entry.status);
    const items =
      record && matchesStatus ? [AriaEntryRecordSchema.parse(record)] : [];
    return {
      items,
      total: items.length,
      page,
      limit,
    };
  }
  return adapter.listEntries({
    collectionId: params.collectionId,
    status: params.status,
    locale,
    localeFallbacks: resolveContentLocaleChain(settings, locale),
    limit,
    page,
    sort: params.sort,
    filter,
  });
}

export async function getEntryFromAdapter(
  adapter: StorageAdapter,
  options: {
    collectionId: string;
    idOrSlug: string;
    locale?: string;
    include?: string[];
  },
): Promise<AriaEntryRecord> {
  await getCollectionFromAdapter(adapter, options.collectionId);
  const includeRelations = options.include?.includes("relations") ?? false;
  const record = await adapter.getEntry({
    collectionId: options.collectionId,
    idOrSlug: options.idOrSlug,
    locale: options.locale,
    localeFallbacks: resolveContentLocaleChain(
      await getContentLocaleSettings(adapter),
      options.locale,
    ),
    includeAllLocales: true,
    includeRelations,
  });
  if (!record) {
    throw new CmsServiceError(
      "NOT_FOUND",
      `Entry not found: ${options.idOrSlug}`,
    );
  }
  return record;
}

export async function checkEntrySlugAvailabilityOnAdapter(
  adapter: StorageAdapter,
  input: {
    collectionId: string;
    locale: string;
    slug: string;
    excludeEntryId?: string;
  },
): Promise<{ available: boolean }> {
  const settings = await getContentLocaleSettings(adapter);
  const locale = resolveLocale(input.locale, settings);
  assertWritableLocale(locale, settings);
  await getCollectionFromAdapter(adapter, input.collectionId);
  const existing = await adapter.getEntry({
    collectionId: input.collectionId,
    idOrSlug: slugify(input.slug),
    locale,
  });
  return { available: !existing || existing.entry.id === input.excludeEntryId };
}

export async function createEntryOnAdapter(
  adapter: StorageAdapter,
  input: CreateEntryInput,
  actor: ActorRef,
  command?: EntryMutationCommandOptions,
): Promise<AriaEntryRecord> {
  const actorDisplay = cmsActorFromAuthorship(actor);
  const collection = await getCollectionFromAdapter(
    adapter,
    input.collectionId,
  );
  const settings = await getContentLocaleSettings(adapter);
  const locale = resolveLocale(input.locale, settings);
  assertWritableLocale(locale, settings);
  const slug = slugify(input.slug ?? input.title);
  if (!slug) {
    throw new CmsServiceError("VALIDATION_ERROR", "Entry slug is required");
  }

  await assertUniqueSlug(adapter, input.collectionId, locale, slug);

  const status = input.status ?? "draft";
  validateFrontmatterForStatus(collection, input.frontmatter, status);

  const timestamp = nowIso();
  const entryId = generateId();
  const relations = input.relations?.map(
    (relation): AriaEntryRelation => ({
      ...relation,
      sourceEntryId: entryId,
    }),
  );
  validateRelationsForStatus(collection, relations, status);

  const record = AriaEntryRecordSchema.parse({
    entry: {
      id: entryId,
      collectionId: input.collectionId,
      status,
      version: nextVersion(),
      authorId: actorDisplay.id,
      createdAt: timestamp,
      updatedAt: timestamp,
      publishedAt: null,
      scheduledFor: null,
    },
    locales: [
      {
        entryId,
        collectionId: input.collectionId,
        locale,
        slug,
        title: input.title,
        frontmatter: input.frontmatter,
        body: input.body ?? null,
        isSource: true,
        commentsClosed: input.commentsClosed ?? false,
      },
    ],
    relations,
    authorship: {
      author: actorDisplay,
      createdBy: actorDisplay,
      updatedBy: actorDisplay,
      publishedBy: null,
    },
  });

  const saved = command
    ? await commitEntryMutation(adapter, {
        record,
        relations,
        revision: buildEntryRevision(record, actor, "Created entry"),
        command,
      })
    : await adapter.saveEntry(record, relations ? { relations } : undefined);
  await syncCmsEntrySearchDocuments(adapter, saved);
  if (!command) await saveRevision(adapter, saved, actor, "Created entry");
  return saved;
}

export async function updateEntryOnAdapter(
  adapter: StorageAdapter,
  input: UpdateEntryInput,
  actor: ActorRef,
  command?: EntryMutationCommandOptions,
): Promise<AriaEntryRecord> {
  const actorDisplay = cmsActorFromAuthorship(actor);
  const collection = await getCollectionFromAdapter(
    adapter,
    input.collectionId,
  );
  const current = await getEntryFromAdapter(adapter, {
    collectionId: input.collectionId,
    idOrSlug: input.id,
    include: ["relations"],
  });
  const settings = await getContentLocaleSettings(adapter);

  if (current.entry.version !== input.version) {
    throw new CmsServiceError(
      "CONFLICT",
      `Entry version conflict: expected ${input.version}, found ${current.entry.version}`,
    );
  }

  const localeCode = resolveLocale(input.patch.locale, settings);
  assertWritableLocale(localeCode, settings, current.locales);
  const sourceLocale =
    current.locales.find((locale) => locale.locale === localeCode) ??
    current.locales.find((locale) => locale.isSource) ??
    current.locales[0];
  if (!sourceLocale) {
    throw new CmsServiceError(
      "VALIDATION_ERROR",
      "Entry is missing locale data",
    );
  }

  const nextSlug = input.patch.slug
    ? slugify(input.patch.slug)
    : sourceLocale.slug;
  if (input.patch.slug) {
    await assertUniqueSlug(
      adapter,
      input.collectionId,
      localeCode,
      nextSlug,
      current.entry.id,
    );
  }

  const mergedFrontmatter = {
    ...sourceLocale.frontmatter,
    ...(input.patch.frontmatter ?? {}),
  };
  const sanitizedFrontmatter = sanitizeFrontmatterForCollection(
    collection,
    mergedFrontmatter,
  );
  if (
    input.patch.status === "scheduled" ||
    input.patch.status === "published"
  ) {
    throw new CmsServiceError(
      "VALIDATION_ERROR",
      "Use publish actions to change entry status to scheduled or published",
    );
  }
  const nextStatus =
    input.patch.status ??
    (current.entry.status === "scheduled" ? "draft" : current.entry.status);
  const nextScheduledFor =
    current.entry.status === "scheduled" ||
    nextStatus === "draft" ||
    nextStatus === "archived"
      ? null
      : current.entry.scheduledFor;
  const nextRelations = input.patch.relations ?? current.relations;
  validateFrontmatterForStatus(collection, sanitizedFrontmatter, nextStatus);
  validateRelationsForStatus(collection, nextRelations, nextStatus);

  const timestamp = nowIso();
  let didUpdateLocale = false;
  const nextLocales = current.locales.map((locale) => {
    if (locale.locale !== localeCode) {
      return locale;
    }
    didUpdateLocale = true;
    return {
      ...locale,
      slug: nextSlug,
      title: input.patch.title ?? locale.title,
      frontmatter: sanitizedFrontmatter,
      body: input.patch.body !== undefined ? input.patch.body : locale.body,
      commentsClosed:
        input.patch.commentsClosed !== undefined
          ? input.patch.commentsClosed
          : (locale.commentsClosed ?? false),
      translationMeta:
        input.patch.translationMeta !== undefined
          ? input.patch.translationMeta
          : locale.translationMeta,
    };
  });
  if (!didUpdateLocale) {
    nextLocales.push({
      ...sourceLocale,
      entryId: current.entry.id,
      collectionId: input.collectionId,
      locale: localeCode,
      slug: nextSlug,
      title: input.patch.title ?? sourceLocale.title,
      frontmatter: sanitizedFrontmatter,
      body:
        input.patch.body !== undefined ? input.patch.body : sourceLocale.body,
      isSource: false,
      commentsClosed:
        input.patch.commentsClosed ?? sourceLocale.commentsClosed ?? false,
      translationMeta: input.patch.translationMeta ?? null,
    });
  }

  const nextRecord = AriaEntryRecordSchema.parse({
    entry: {
      ...current.entry,
      status: nextStatus,
      version: nextVersion(),
      authorId: actorDisplay.id,
      updatedAt: timestamp,
      scheduledFor: nextScheduledFor,
    },
    locales: nextLocales,
    relations: nextRelations,
    authorship: {
      author: actorDisplay,
      createdBy:
        current.authorship?.createdBy ?? current.authorship?.author ?? null,
      updatedBy: actorDisplay,
      publishedBy: current.authorship?.publishedBy ?? null,
    },
  });

  try {
    const saved = command
      ? await commitEntryMutation(adapter, {
          record: nextRecord,
          expectedVersion: input.version,
          relations: nextRecord.relations,
          revision: buildEntryRevision(current, actor, "Before update"),
          command,
        })
      : await (async () => {
          await saveRevision(adapter, current, actor, "Before update");
          return adapter.saveEntry(nextRecord, {
            expectedVersion: input.version,
            relations: nextRecord.relations,
          });
        })();
    await syncCmsEntrySearchDocuments(adapter, saved);
    return saved;
  } catch (error) {
    if (error instanceof Error && error.message.includes("version conflict")) {
      throw new CmsServiceError("CONFLICT", error.message);
    }
    throw error;
  }
}

export async function deleteEntryOnAdapter(
  adapter: StorageAdapter,
  collectionId: string,
  entryId: string,
): Promise<void> {
  await getEntryFromAdapter(adapter, { collectionId, idOrSlug: entryId });
  await adapter.deleteEntry(collectionId, entryId);
  await removeCmsEntrySearchDocuments(adapter, entryId);
}

export async function restoreEntrySnapshotOnAdapter(
  adapter: StorageAdapter,
  input: {
    collectionId: string;
    snapshot: AriaEntryRecord;
    expectedVersion?: string;
    message?: string;
  },
  actor: ActorRef,
): Promise<AriaEntryRecord> {
  const collection = await getCollectionFromAdapter(
    adapter,
    input.collectionId,
  );
  const actorDisplay = cmsActorFromAuthorship(actor);
  const current = await adapter.getEntry({
    collectionId: input.collectionId,
    idOrSlug: input.snapshot.entry.id,
    includeRelations: true,
  });

  if (
    current &&
    input.expectedVersion &&
    current.entry.version !== input.expectedVersion
  ) {
    throw new CmsServiceError(
      "CONFLICT",
      `Entry version conflict: expected ${input.expectedVersion}, found ${current.entry.version}`,
    );
  }

  for (const locale of input.snapshot.locales) {
    await assertUniqueSlug(
      adapter,
      input.collectionId,
      locale.locale,
      locale.slug,
      input.snapshot.entry.id,
    );
    validateFrontmatterForStatus(
      collection,
      locale.frontmatter,
      input.snapshot.entry.status,
    );
  }
  validateRelationsForStatus(
    collection,
    input.snapshot.relations,
    input.snapshot.entry.status,
  );

  const timestamp = nowIso();
  const version = nextVersion();
  const restored = AriaEntryRecordSchema.parse({
    entry: {
      ...input.snapshot.entry,
      collectionId: input.collectionId,
      version,
      authorId: actorDisplay.id,
      updatedAt: timestamp,
    },
    locales: input.snapshot.locales.map((locale) => ({
      ...locale,
      entryId: input.snapshot.entry.id,
      collectionId: input.collectionId,
    })),
    relations: input.snapshot.relations?.map((relation) => ({
      ...relation,
      sourceEntryId: input.snapshot.entry.id,
    })),
    authorship: {
      author: actorDisplay,
      createdBy:
        current?.authorship?.createdBy ??
        input.snapshot.authorship?.createdBy ??
        input.snapshot.authorship?.author ??
        null,
      updatedBy: actorDisplay,
      publishedBy:
        input.snapshot.entry.status === "published" ||
        input.snapshot.entry.status === "scheduled"
          ? (current?.authorship?.publishedBy ??
            input.snapshot.authorship?.publishedBy ??
            null)
          : null,
    },
  });

  const saved = await adapter.saveEntry(restored, {
    expectedVersion: current ? input.expectedVersion : undefined,
    relations: restored.relations,
    replaceLocales: true,
  });
  await syncCmsEntrySearchDocuments(adapter, saved);
  await saveRevision(
    adapter,
    saved,
    actor,
    input.message ?? "Restored entry snapshot",
  );
  return saved;
}

async function uniqueCopiedSlug(
  adapter: StorageAdapter,
  collectionId: string,
  locale: string,
  sourceSlug: string,
): Promise<string> {
  const base = slugify(`${sourceSlug}-copy`);
  for (let index = 0; index < 100; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`;
    const existing = await adapter.getEntry({
      collectionId,
      idOrSlug: candidate,
      locale,
    });
    if (!existing) {
      return candidate;
    }
  }
  throw new CmsServiceError(
    "CONFLICT",
    `Unable to generate a unique copied slug for ${sourceSlug}`,
  );
}

export async function duplicateEntryOnAdapter(
  adapter: StorageAdapter,
  input: { collectionId: string; id: string },
  actor: ActorRef,
): Promise<AriaEntryRecord> {
  await getCollectionFromAdapter(adapter, input.collectionId);
  const source = await getEntryFromAdapter(adapter, {
    collectionId: input.collectionId,
    idOrSlug: input.id,
    include: ["relations"],
  });
  const actorDisplay = cmsActorFromAuthorship(actor);
  const timestamp = nowIso();
  const entryId = generateId();

  const locales = await Promise.all(
    source.locales.map(async (locale) => ({
      ...locale,
      entryId,
      collectionId: input.collectionId,
      slug: await uniqueCopiedSlug(
        adapter,
        input.collectionId,
        locale.locale,
        locale.slug,
      ),
      title: `${locale.title || "Untitled"} Copy`,
    })),
  );
  const relations = source.relations?.map((relation) => ({
    ...relation,
    sourceEntryId: entryId,
  }));

  const duplicate = AriaEntryRecordSchema.parse({
    entry: {
      id: entryId,
      collectionId: input.collectionId,
      status: "draft",
      version: nextVersion(),
      authorId: actorDisplay.id,
      createdAt: timestamp,
      updatedAt: timestamp,
      publishedAt: null,
      scheduledFor: null,
    },
    locales,
    relations,
    authorship: {
      author: actorDisplay,
      createdBy: actorDisplay,
      updatedBy: actorDisplay,
      publishedBy: null,
    },
  });

  const saved = await adapter.saveEntry(duplicate, { relations });
  await syncCmsEntrySearchDocuments(adapter, saved);
  await saveRevision(adapter, saved, actor, "Duplicated entry");
  return saved;
}

async function transitionEntryStatus(
  adapter: StorageAdapter,
  input: {
    collectionId: string;
    id: string;
    version: string;
    status: AriaEntryRecord["entry"]["status"];
    actor: ActorRef;
    scheduledFor?: string | null;
    publishedAt?: string | null;
  },
  command?: EntryMutationCommandOptions,
): Promise<AriaEntryRecord> {
  const actorDisplay = cmsActorFromAuthorship(input.actor);
  const collection = await getCollectionFromAdapter(
    adapter,
    input.collectionId,
  );
  const current = await getEntryFromAdapter(adapter, {
    collectionId: input.collectionId,
    idOrSlug: input.id,
    include: ["relations"],
  });

  if (current.entry.version !== input.version) {
    throw new CmsServiceError(
      "CONFLICT",
      `Entry version conflict: expected ${input.version}, found ${current.entry.version}`,
    );
  }

  for (const locale of current.locales) {
    validateFrontmatterForStatus(collection, locale.frontmatter, input.status);
  }
  validateRelationsForStatus(collection, current.relations, input.status);
  if (input.status === "published") {
    await assertPublishedCmsEntryRoutesAvailable({
      adapter,
      collection,
      record: current,
      settings: await getContentLocaleSettings(adapter),
    });
  }

  const timestamp = nowIso();
  const version = nextVersion();
  const nextRecord = AriaEntryRecordSchema.parse({
    ...current,
    entry: {
      ...current.entry,
      status: input.status,
      version,
      authorId: actorDisplay.id,
      updatedAt: timestamp,
      publishedAt:
        input.publishedAt !== undefined
          ? input.publishedAt
          : current.entry.publishedAt,
      scheduledFor:
        input.scheduledFor !== undefined
          ? input.scheduledFor
          : current.entry.scheduledFor,
    },
    authorship: {
      author: actorDisplay,
      createdBy:
        current.authorship?.createdBy ?? current.authorship?.author ?? null,
      updatedBy: actorDisplay,
      publishedBy:
        input.publishedAt === null
          ? null
          : input.publishedAt !== undefined
            ? actorDisplay
            : (current.authorship?.publishedBy ?? null),
    },
  });

  const saved = command
    ? await commitEntryMutation(adapter, {
        record: nextRecord,
        expectedVersion: input.version,
        relations: current.relations,
        revision: buildEntryRevision(
          current,
          input.actor,
          `Before ${input.status}`,
        ),
        command,
      })
    : await (async () => {
        await saveRevision(
          adapter,
          current,
          input.actor,
          `Before ${input.status}`,
        );
        return adapter.saveEntry(nextRecord, {
          expectedVersion: input.version,
          relations: current.relations,
        });
      })();
  await syncCmsEntrySearchDocuments(adapter, saved);
  return saved;
}

export async function publishEntryOnAdapter(
  adapter: StorageAdapter,
  input: {
    collectionId: string;
    id: string;
    version: string;
    scheduledFor?: string;
  },
  actor: ActorRef,
  command?: EntryMutationCommandOptions,
): Promise<AriaEntryRecord> {
  if (input.scheduledFor) {
    assertFutureScheduledFor(input.scheduledFor);
  }
  const timestamp = nowIso();
  const status = input.scheduledFor ? "scheduled" : "published";
  return transitionEntryStatus(
    adapter,
    {
      collectionId: input.collectionId,
      id: input.id,
      version: input.version,
      status,
      actor,
      scheduledFor: input.scheduledFor ?? null,
      publishedAt: input.scheduledFor ? null : timestamp,
    },
    command,
  );
}

export async function unpublishEntryOnAdapter(
  adapter: StorageAdapter,
  input: { collectionId: string; id: string; version: string },
  actorId: ActorRef,
  command?: EntryMutationCommandOptions,
): Promise<AriaEntryRecord> {
  return transitionEntryStatus(
    adapter,
    {
      collectionId: input.collectionId,
      id: input.id,
      version: input.version,
      status: "draft",
      actor: actorId,
      publishedAt: null,
      scheduledFor: null,
    },
    command,
  );
}

export async function archiveEntryOnAdapter(
  adapter: StorageAdapter,
  input: { collectionId: string; id: string; version: string },
  actorId: ActorRef,
  command?: EntryMutationCommandOptions,
): Promise<AriaEntryRecord> {
  return transitionEntryStatus(
    adapter,
    {
      collectionId: input.collectionId,
      id: input.id,
      version: input.version,
      status: "archived",
      actor: actorId,
      scheduledFor: null,
    },
    command,
  );
}
