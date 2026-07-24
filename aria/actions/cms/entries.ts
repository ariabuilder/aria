import { defineAction } from "astro:actions";
import { getStorageAdapterAsync } from "../../lib/storage/getStorageAdapter";
import {
  AriaEntryRecordSchema,
  CreateEntryRequestSchema,
  EntryListRequestSchema,
  EntryQueryRequestSchema,
  UpdateEntryRequestSchema,
} from "../../lib/cms/schemas";
import {
  ArchiveEntryRequestSchema,
  DeleteEntryRequestSchema,
  DuplicateEntryRequestSchema,
  GetEntryRequestSchema,
  ListEntriesResponseSchema,
  PublishEntryRequestSchema,
  RestoreEntrySnapshotRequestSchema,
  CheckEntrySlugAvailabilityRequestSchema,
  CheckEntrySlugAvailabilityResponseSchema,
  UnpublishEntryRequestSchema,
} from "../../lib/cms/actionSchemas";
import { rethrowCmsError } from "../../lib/cms/actionErrors";
import {
  archiveEntryOnAdapter,
  createEntryOnAdapter,
  deleteEntryOnAdapter,
  duplicateEntryOnAdapter,
  getEntryFromAdapter,
  listEntriesFromAdapter,
  publishEntryOnAdapter,
  queryEntriesFromAdapter,
  restoreEntrySnapshotOnAdapter,
  unpublishEntryOnAdapter,
  updateEntryOnAdapter,
  checkEntrySlugAvailabilityOnAdapter,
} from "../../lib/cms/services/entries";
import { requireOperation, resolveAuthorizedMutation } from "../_shared";
import { invalidateCmsEntryCacheFromAction } from "../../lib/cms/invalidateEntryCacheFromAction";
import { CmsServiceError } from "../../lib/cms/errors";
import { z } from "zod";
import { listPolicySafeEntries } from "../../lib/cms/services/policySafeEntryCursor";
import {
  assertCmsFieldMutationAllowed,
  changedEntryPatchFields,
  createCmsAuditEvent,
  projectCmsEntryRecord,
} from "../../lib/cms/services/accessPolicy";
import { getApiMutationContext } from "../../lib/api/mutationContext";
import { scheduleIntegrationEventWakeup } from "../../lib/integrations/wakeup";
import {
  recordCmsAudit,
  requireCmsCollectionPolicy,
  resolveCmsPolicyLocale,
} from "./accessPolicy";

async function requireStatusOperation(
  context: Parameters<typeof requireOperation>[0],
  status: "draft" | "published" | "scheduled" | "archived",
): Promise<void> {
  await requireOperation(
    context,
    status === "published" || status === "scheduled"
      ? "cms.entries.publish"
      : status === "archived"
        ? "cms.entries.archive"
        : "cms.entries.unpublish",
  );
}

function wakeIntegrationQueue(context: { locals: App.Locals }) {
  return (event: Parameters<typeof scheduleIntegrationEventWakeup>[1]) =>
    scheduleIntegrationEventWakeup(context.locals, event);
}

async function readEntryForActor(
  adapter: Awaited<ReturnType<typeof getStorageAdapterAsync>>,
  user: Awaited<ReturnType<typeof requireOperation>>,
  input: {
    collectionId: string;
    idOrSlug: string;
    locale?: string;
    include?: string[];
  },
) {
  const record = await getEntryFromAdapter(adapter, input);
  const locale = await resolveCmsPolicyLocale(adapter, record, input.locale);
  const decision = await requireCmsCollectionPolicy(adapter, {
    actor: user,
    collectionId: input.collectionId,
    action: "read",
    locale,
    entry: record,
  });
  const projected = projectCmsEntryRecord(record, decision);
  if (!projected) {
    throw new CmsServiceError(
      "NOT_FOUND",
      `Entry not found: ${input.idOrSlug}`,
    );
  }
  return { record, projected };
}

export const entries = {
  listCursor: defineAction({
    accept: "json",
    input: z
      .object({
        collectionId: z.string().trim().min(1),
        locale: z.string().trim().min(1).optional(),
        status: z
          .union([
            z.enum(["draft", "published", "scheduled", "archived"]),
            z.array(z.enum(["draft", "published", "scheduled", "archived"])),
          ])
          .optional(),
        query: z.string().trim().optional(),
        pageSize: z.int().positive().max(100),
        cursor: z
          .object({ page: z.int().positive(), index: z.int().nonnegative() })
          .optional(),
      })
      .strict(),
    handler: async (input, context) => {
      const actor = await requireOperation(context, "cms.entries.listCursor");
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        return await listPolicySafeEntries({
          adapter,
          actor,
          ...input,
        });
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),

  checkSlugAvailability: defineAction({
    accept: "json",
    input: CheckEntrySlugAvailabilityRequestSchema,
    handler: async (input, context) => {
      const user = await requireOperation(context, "cms.entries.get");
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: input.collectionId,
          action: "create",
          locale: input.locale,
        });
        return CheckEntrySlugAvailabilityResponseSchema.parse(
          await checkEntrySlugAvailabilityOnAdapter(adapter, input),
        );
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),

  list: defineAction({
    accept: "json",
    input: EntryListRequestSchema,
    handler: async (input, context) => {
      const user = await requireOperation(context, "cms.entries.list");
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        const result = await listEntriesFromAdapter(adapter, input);
        const items = (
          await Promise.all(
            result.items.map(async (record) => {
              const locale = await resolveCmsPolicyLocale(
                adapter,
                record,
                input.locale,
              );
              const decision = await requireCmsCollectionPolicy(adapter, {
                actor: user,
                collectionId: input.collectionId,
                action: "read",
                locale,
                entry: record,
                allowDenied: true,
              });
              return projectCmsEntryRecord(record, decision);
            }),
          )
        ).filter(
          (record): record is NonNullable<typeof record> => record !== null,
        );
        return ListEntriesResponseSchema.parse({
          ...result,
          items,
          total: items.length,
        });
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),

  query: defineAction({
    accept: "json",
    input: EntryQueryRequestSchema,
    handler: async (input, context) => {
      const user = await requireOperation(context, "cms.entries.query");
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        const result = await queryEntriesFromAdapter(adapter, input);
        const items = (
          await Promise.all(
            result.items.map(async (record) => {
              const locale = await resolveCmsPolicyLocale(
                adapter,
                record,
                input.locale,
              );
              const decision = await requireCmsCollectionPolicy(adapter, {
                actor: user,
                collectionId: input.collectionId,
                action: "read",
                locale,
                entry: record,
                allowDenied: true,
              });
              return projectCmsEntryRecord(record, decision);
            }),
          )
        ).filter(
          (record): record is NonNullable<typeof record> => record !== null,
        );
        return ListEntriesResponseSchema.parse({
          ...result,
          items,
          total: items.length,
        });
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),

  get: defineAction({
    accept: "json",
    input: GetEntryRequestSchema,
    handler: async (input, context) => {
      const user = await requireOperation(context, "cms.entries.get");
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        const { projected } = await readEntryForActor(adapter, user, input);
        return AriaEntryRecordSchema.parse(projected);
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),

  create: defineAction({
    accept: "json",
    input: CreateEntryRequestSchema,
    handler: async (input, context) => {
      const { user, authorship } = await resolveAuthorizedMutation(
        context,
        "cms.entries.create",
        "cms-entry-create",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        const decision = await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: input.collectionId,
          action: "create",
          locale: await resolveCmsPolicyLocale(
            adapter,
            undefined,
            input.locale,
          ),
        });
        if (input.status && input.status !== "draft") {
          await requireStatusOperation(context, input.status);
          await requireCmsCollectionPolicy(adapter, {
            actor: user,
            collectionId: input.collectionId,
            action: "publish",
            locale: await resolveCmsPolicyLocale(
              adapter,
              undefined,
              input.locale,
            ),
          });
        }
        assertCmsFieldMutationAllowed(decision, [
          "title",
          "slug",
          ...(input.body === undefined ? [] : ["body"]),
          ...Object.keys(input.frontmatter),
          ...(input.relations?.map((relation) => relation.fieldKey) ?? []),
        ]);
        const record = await createEntryOnAdapter(
          adapter,
          input,
          authorship.actor,
          {
            apiContext: getApiMutationContext(context),
            onIntegrationEventCommitted: wakeIntegrationQueue(context),
            auditEventFor: (created) =>
              createCmsAuditEvent({
                action: "entry.create",
                actorId: user.id,
                actorUsername: user.username,
                collectionId: created.entry.collectionId,
                entryId: created.entry.id,
                summary: "Created CMS entry",
                metadata: {},
              }),
          },
        );
        return AriaEntryRecordSchema.parse(record);
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),

  update: defineAction({
    accept: "json",
    input: UpdateEntryRequestSchema,
    handler: async (input, context) => {
      const { user, authorship } = await resolveAuthorizedMutation(
        context,
        "cms.entries.update",
        "cms-entry-update",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        const current = await getEntryFromAdapter(adapter, {
          collectionId: input.collectionId,
          idOrSlug: input.id,
        });
        const locale = await resolveCmsPolicyLocale(
          adapter,
          current,
          input.patch.locale,
        );
        const decision = await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: input.collectionId,
          action: "update",
          locale,
          entry: current,
        });
        if (input.patch.status !== undefined) {
          await requireStatusOperation(context, input.patch.status);
          await requireCmsCollectionPolicy(adapter, {
            actor: user,
            collectionId: input.collectionId,
            action: "publish",
            locale,
            entry: current,
          });
        }
        if (
          input.patch.translationMeta !== undefined &&
          decision.editableFields
        ) {
          throw new CmsServiceError(
            "FORBIDDEN",
            "Restricted field policies cannot edit translation metadata",
          );
        }
        assertCmsFieldMutationAllowed(
          decision,
          changedEntryPatchFields(input.patch),
        );
        const record = await updateEntryOnAdapter(
          adapter,
          input,
          authorship.actor,
          {
            apiContext: getApiMutationContext(context),
            onIntegrationEventCommitted: wakeIntegrationQueue(context),
            auditEventFor: (updated) =>
              createCmsAuditEvent({
                action: "entry.update",
                actorId: user.id,
                actorUsername: user.username,
                collectionId: updated.entry.collectionId,
                entryId: updated.entry.id,
                summary: "Updated CMS entry",
                metadata: { fields: changedEntryPatchFields(input.patch) },
              }),
          },
        );
        if (record.entry.status === "published") {
          await invalidateCmsEntryCacheFromAction(context, {
            collectionId: record.entry.collectionId,
            entryId: record.entry.id,
          });
        }
        return AriaEntryRecordSchema.parse(record);
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),

  remove: defineAction({
    accept: "json",
    input: DeleteEntryRequestSchema,
    handler: async (input, context) => {
      const { user } = await resolveAuthorizedMutation(
        context,
        "cms.entries.remove",
        "cms-entry-delete",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        const existing = await getEntryFromAdapter(adapter, {
          collectionId: input.collectionId,
          idOrSlug: input.id,
        });
        await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: input.collectionId,
          action: "delete",
          locale: await resolveCmsPolicyLocale(adapter, existing),
          entry: existing,
        });
        await recordCmsAudit(adapter, {
          actor: user,
          action: "entry.delete",
          collectionId: input.collectionId,
          entryId: input.id,
          summary: "Deleted CMS entry",
        });
        await deleteEntryOnAdapter(adapter, input.collectionId, input.id);
        if (existing?.entry.status === "published") {
          await invalidateCmsEntryCacheFromAction(context, {
            collectionId: input.collectionId,
            entryId: input.id,
          });
        }
        return { success: true as const };
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),

  duplicate: defineAction({
    accept: "json",
    input: DuplicateEntryRequestSchema,
    handler: async (input, context) => {
      const { user, authorship } = await resolveAuthorizedMutation(
        context,
        "cms.entries.create",
        "cms-entry-create",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        const source = await getEntryFromAdapter(adapter, {
          collectionId: input.collectionId,
          idOrSlug: input.id,
        });
        for (const sourceLocale of source.locales) {
          const readDecision = await requireCmsCollectionPolicy(adapter, {
            actor: user,
            collectionId: input.collectionId,
            action: "read",
            locale: sourceLocale.locale,
            entry: source,
          });
          const createDecision = await requireCmsCollectionPolicy(adapter, {
            actor: user,
            collectionId: input.collectionId,
            action: "create",
            locale: sourceLocale.locale,
          });
          if (readDecision.visibleFields || createDecision.editableFields) {
            throw new CmsServiceError(
              "FORBIDDEN",
              "Restricted field policies cannot duplicate a full entry",
            );
          }
        }
        const record = await duplicateEntryOnAdapter(
          adapter,
          input,
          authorship.actor,
        );
        await recordCmsAudit(adapter, {
          actor: user,
          action: "entry.duplicate",
          collectionId: record.entry.collectionId,
          entryId: record.entry.id,
          summary: "Duplicated CMS entry",
          metadata: { sourceEntryId: source.entry.id },
        });
        return AriaEntryRecordSchema.parse(record);
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),

  restoreSnapshot: defineAction({
    accept: "json",
    input: RestoreEntrySnapshotRequestSchema,
    handler: async (input, context) => {
      const { user, authorship } = await resolveAuthorizedMutation(
        context,
        "cms.entries.update",
        "cms-entry-update",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        const current = await getEntryFromAdapter(adapter, {
          collectionId: input.collectionId,
          idOrSlug: input.snapshot.entry.id,
        });
        const decision = await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: input.collectionId,
          action: "update",
          locale: await resolveCmsPolicyLocale(adapter, current),
          entry: current,
        });
        if (decision.editableFields) {
          assertCmsFieldMutationAllowed(decision, ["title", "slug", "body"]);
          throw new CmsServiceError(
            "FORBIDDEN",
            "Restricted field policies cannot restore a full entry snapshot",
          );
        }
        const record = await restoreEntrySnapshotOnAdapter(
          adapter,
          input,
          authorship.actor,
        );
        if (record.entry.status === "published") {
          await invalidateCmsEntryCacheFromAction(context, {
            collectionId: record.entry.collectionId,
            entryId: record.entry.id,
          });
        }
        await recordCmsAudit(adapter, {
          actor: user,
          action: "entry.restore_snapshot",
          collectionId: record.entry.collectionId,
          entryId: record.entry.id,
          summary: "Restored CMS entry snapshot",
        });
        return AriaEntryRecordSchema.parse(record);
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),

  publish: defineAction({
    accept: "json",
    input: PublishEntryRequestSchema,
    handler: async (input, context) => {
      const { user, authorship } = await resolveAuthorizedMutation(
        context,
        "cms.entries.publish",
        "cms-entry-publish",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        const current = await getEntryFromAdapter(adapter, {
          collectionId: input.collectionId,
          idOrSlug: input.id,
        });
        await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: input.collectionId,
          action: "publish",
          locale: await resolveCmsPolicyLocale(adapter, current),
          entry: current,
        });
        const record = await publishEntryOnAdapter(
          adapter,
          input,
          authorship.actor,
          {
            apiContext: getApiMutationContext(context),
            onIntegrationEventCommitted: wakeIntegrationQueue(context),
            auditEventFor: (published) =>
              createCmsAuditEvent({
                action: "entry.publish",
                actorId: user.id,
                actorUsername: user.username,
                collectionId: published.entry.collectionId,
                entryId: published.entry.id,
                summary: "Published CMS entry",
                metadata: {},
              }),
          },
        );
        await invalidateCmsEntryCacheFromAction(context, {
          collectionId: record.entry.collectionId,
          entryId: record.entry.id,
        });
        return AriaEntryRecordSchema.parse(record);
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),

  unpublish: defineAction({
    accept: "json",
    input: UnpublishEntryRequestSchema,
    handler: async (input, context) => {
      const { user, authorship } = await resolveAuthorizedMutation(
        context,
        "cms.entries.unpublish",
        "cms-entry-unpublish",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        const current = await getEntryFromAdapter(adapter, {
          collectionId: input.collectionId,
          idOrSlug: input.id,
        });
        await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: input.collectionId,
          action: "publish",
          locale: await resolveCmsPolicyLocale(adapter, current),
          entry: current,
        });
        const record = await unpublishEntryOnAdapter(
          adapter,
          input,
          authorship.actor,
          {
            apiContext: getApiMutationContext(context),
            onIntegrationEventCommitted: wakeIntegrationQueue(context),
            auditEventFor: (unpublished) =>
              createCmsAuditEvent({
                action: "entry.unpublish",
                actorId: user.id,
                actorUsername: user.username,
                collectionId: unpublished.entry.collectionId,
                entryId: unpublished.entry.id,
                summary: "Unpublished CMS entry",
                metadata: {},
              }),
          },
        );
        await invalidateCmsEntryCacheFromAction(context, {
          collectionId: record.entry.collectionId,
          entryId: record.entry.id,
        });
        return AriaEntryRecordSchema.parse(record);
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),

  archive: defineAction({
    accept: "json",
    input: ArchiveEntryRequestSchema,
    handler: async (input, context) => {
      const { user, authorship } = await resolveAuthorizedMutation(
        context,
        "cms.entries.archive",
        "cms-entry-archive",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        const current = await getEntryFromAdapter(adapter, {
          collectionId: input.collectionId,
          idOrSlug: input.id,
        });
        await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: input.collectionId,
          action: "publish",
          locale: await resolveCmsPolicyLocale(adapter, current),
          entry: current,
        });
        const record = await archiveEntryOnAdapter(
          adapter,
          input,
          authorship.actor,
          {
            apiContext: getApiMutationContext(context),
            onIntegrationEventCommitted: wakeIntegrationQueue(context),
            auditEventFor: (archived) =>
              createCmsAuditEvent({
                action: "entry.archive",
                actorId: user.id,
                actorUsername: user.username,
                collectionId: archived.entry.collectionId,
                entryId: archived.entry.id,
                summary: "Archived CMS entry",
                metadata: {},
              }),
          },
        );
        await invalidateCmsEntryCacheFromAction(context, {
          collectionId: record.entry.collectionId,
          entryId: record.entry.id,
        });
        return AriaEntryRecordSchema.parse(record);
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),
};
