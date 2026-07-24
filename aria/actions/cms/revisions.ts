import { defineAction } from "astro:actions";
import { getStorageAdapterAsync } from "../../lib/storage/getStorageAdapter";
import {
  AriaEntryRecordSchema,
  AriaEntryRevisionSchema,
} from "../../lib/cms/schemas";
import {
  GetRevisionRequestSchema,
  ListRevisionsRequestSchema,
  ListRevisionsResponseSchema,
  RestoreRevisionRequestSchema,
} from "../../lib/cms/actionSchemas";
import { rethrowCmsError } from "../../lib/cms/actionErrors";
import {
  getRevisionFromAdapter,
  listRevisionsFromAdapter,
  restoreRevisionOnAdapter,
} from "../../lib/cms/services/revisions";
import { requireOperation, resolveAuthorizedMutation } from "../_shared";
import { getAuthAdapterAsync } from "../../lib/auth/getAuthAdapter";
import { enrichCmsRevisionsWithAvatars } from "../../lib/cms/services/revisionAvatars";
import {
  assertCmsFieldMutationAllowed,
  createCmsAuditEvent,
  projectCmsEntryRevision,
} from "../../lib/cms/services/accessPolicy";
import { getEntryFromAdapter } from "../../lib/cms/services/entries";
import {
  requireCmsCollectionPolicy,
  resolveCmsPolicyLocale,
} from "./accessPolicy";
import { CmsServiceError } from "../../lib/cms/errors";
import { getApiMutationContext } from "../../lib/api/mutationContext";
import { scheduleIntegrationEventWakeup } from "../../lib/integrations/wakeup";

export const revisions = {
  list: defineAction({
    accept: "json",
    input: ListRevisionsRequestSchema,
    handler: async (input, context) => {
      const user = await requireOperation(context, "cms.revisions.list");
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        const entry = await getEntryFromAdapter(adapter, {
          collectionId: input.collectionId,
          idOrSlug: input.entryId,
        });
        const result = await listRevisionsFromAdapter(adapter, input);
        const authAdapter = await getAuthAdapterAsync(context.locals);
        const users = await authAdapter.listUsers();
        const revisions = (
          await Promise.all(
            enrichCmsRevisionsWithAvatars(result.revisions, users).map(
              async (revision) => {
                const decision = await requireCmsCollectionPolicy(adapter, {
                  actor: user,
                  collectionId: input.collectionId,
                  action: "read",
                  locale:
                    revision.locale ??
                    (await resolveCmsPolicyLocale(adapter, entry)),
                  entry,
                  allowDenied: true,
                });
                return projectCmsEntryRevision(revision, decision);
              },
            ),
          )
        ).filter(
          (revision): revision is NonNullable<typeof revision> =>
            revision !== null,
        );
        return ListRevisionsResponseSchema.parse({
          ...result,
          revisions,
        });
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),

  get: defineAction({
    accept: "json",
    input: GetRevisionRequestSchema,
    handler: async (input, context) => {
      const user = await requireOperation(context, "cms.revisions.get");
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        const revision = await getRevisionFromAdapter(
          adapter,
          input.revisionId,
        );
        const entry = await getEntryFromAdapter(adapter, {
          collectionId: revision.snapshot.entry.collectionId,
          idOrSlug: revision.entryId,
        });
        const decision = await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: entry.entry.collectionId,
          action: "read",
          locale:
            revision.locale ?? (await resolveCmsPolicyLocale(adapter, entry)),
          entry,
        });
        const authAdapter = await getAuthAdapterAsync(context.locals);
        const [enriched] = enrichCmsRevisionsWithAvatars(
          [revision],
          await authAdapter.listUsers(),
        );
        const projected = projectCmsEntryRevision(enriched, decision);
        if (!projected) {
          throw new CmsServiceError("NOT_FOUND", "Revision not found");
        }
        return AriaEntryRevisionSchema.parse(projected);
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),

  restore: defineAction({
    accept: "json",
    input: RestoreRevisionRequestSchema,
    handler: async (input, context) => {
      const { user, authorship } = await resolveAuthorizedMutation(
        context,
        "cms.revisions.restore",
        "cms-revision-restore",
      );
      await requireOperation(context, "cms.entries.publish");
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        const revision = await getRevisionFromAdapter(
          adapter,
          input.revisionId,
        );
        const entry = await getEntryFromAdapter(adapter, {
          collectionId: input.collectionId,
          idOrSlug: input.entryId,
        });
        const decision = await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: input.collectionId,
          action: "update",
          locale:
            revision.locale ?? (await resolveCmsPolicyLocale(adapter, entry)),
          entry,
        });
        await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: input.collectionId,
          action: "publish",
          locale:
            revision.locale ?? (await resolveCmsPolicyLocale(adapter, entry)),
          entry,
        });
        if (decision.editableFields) {
          assertCmsFieldMutationAllowed(decision, ["title", "slug", "body"]);
          throw new CmsServiceError(
            "FORBIDDEN",
            "Restricted field policies cannot restore a full revision",
          );
        }
        const record = await restoreRevisionOnAdapter(
          adapter,
          input,
          authorship.actor,
          {
            apiContext: getApiMutationContext(context),
            onIntegrationEventCommitted: (event) =>
              scheduleIntegrationEventWakeup(context.locals, event),
            auditEventFor: (restored) =>
              createCmsAuditEvent({
                action: "entry.restore_revision",
                actorId: user.id,
                actorUsername: user.username,
                collectionId: restored.entry.collectionId,
                entryId: restored.entry.id,
                summary: "Restored CMS entry revision",
                metadata: { revisionId: input.revisionId },
              }),
          },
        );
        return AriaEntryRecordSchema.parse(record);
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),
};
