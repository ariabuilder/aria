import { defineAction } from "astro:actions";
import { getStorageAdapterAsync } from "../../lib/storage/getStorageAdapter";
import {
  AriaCollectionSchema,
  CreateCollectionRequestSchema,
  UpdateCollectionRequestSchema,
} from "../../lib/cms/schemas";
import {
  ClearCollectionTemplateRequestSchema,
  CompileSchemaRequestSchema,
  CompileSchemaResponseSchema,
  DeleteCollectionRequestSchema,
  DeleteCollectionResponseSchema,
  GetCollectionDeleteImpactRequestSchema,
  GetCollectionDeleteImpactResponseSchema,
  GetCollectionAccessRequestSchema,
  GetCollectionPolicyRequestSchema,
  GetCollectionRequestSchema,
  ListCollectionPermissionsRequestSchema,
  ListCollectionPermissionsResponseSchema,
  ListCollectionsRequestSchema,
  ListCollectionsResponseSchema,
  SetCollectionPermissionsRequestSchema,
  SetCollectionPermissionsResponseSchema,
  SetCollectionPolicyRequestSchema,
  CollectionAccessResponseSchema,
  CollectionPolicyResponseSchema,
  ListCmsAuditEventsRequestSchema,
  ListCmsAuditEventsResponseSchema,
  ListCollectionPolicyPrincipalsResponseSchema,
  SetCollectionTemplateRequestSchema,
} from "../../lib/cms/actionSchemas";
import { rethrowCmsError } from "../../lib/cms/actionErrors";
import {
  clearCollectionTemplateOnAdapter,
  compileCollectionSchemaForCollection,
  countEntriesByCollectionFromAdapter,
  createCollectionOnAdapter,
  deleteCollectionOnAdapter,
  getCollectionDeleteImpactOnAdapter,
  getCollectionFromAdapter,
  listCollectionsFromAdapter,
  setCollectionTemplateOnAdapter,
  updateCollectionOnAdapter,
} from "../../lib/cms/services/collections";
import {
  listCollectionPermissionsFromAdapter,
  replaceCollectionPermissionsOnAdapter,
} from "../../lib/cms/services/collectionPermissions";
import {
  getCollectionPolicyFromAdapter,
  inspectCollectionAccessFromAdapter,
  saveCollectionPolicyOnAdapter,
} from "../../lib/cms/services/collectionAccessPolicy";
import {
  invalidateComposeCache,
  requireOperation,
  resolveAuthorizedMutation,
} from "../_shared";
import { invalidateCollectionPublicCache } from "../../lib/cms/invalidateEntryCache";
import { getEntryFromAdapter } from "../../lib/cms/services/entries";
import { getAuthAdapterAsync } from "../../lib/auth/getAuthAdapter";
import {
  recordCmsAudit,
  requireCmsCollectionPolicy,
  resolveCmsPolicyLocale,
} from "./accessPolicy";
import { CmsServiceError } from "../../lib/cms/errors";

export const collections = {
  list: defineAction({
    accept: "json",
    input: ListCollectionsRequestSchema,
    handler: async (input, context) => {
      const user = await requireOperation(context, "cms.collections.list");
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        const locale = await resolveCmsPolicyLocale(adapter);
        const collectionsList = await listCollectionsFromAdapter(
          adapter,
          input,
        );
        const visibleCollections = (
          await Promise.all(
            collectionsList.map(async (collection) => {
              const decision = await requireCmsCollectionPolicy(adapter, {
                actor: user,
                collectionId: collection.id,
                action: "read",
                locale,
                allowDenied: true,
              });
              return decision.allowed ? collection : null;
            }),
          )
        ).filter(
          (collection): collection is NonNullable<typeof collection> =>
            collection !== null,
        );
        const entryCounts = await countEntriesByCollectionFromAdapter(
          adapter,
          visibleCollections,
        );
        return ListCollectionsResponseSchema.parse({
          collections: visibleCollections,
          entryCounts,
        });
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),

  get: defineAction({
    accept: "json",
    input: GetCollectionRequestSchema,
    handler: async (input, context) => {
      const user = await requireOperation(context, "cms.collections.get");
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        const collection = await getCollectionFromAdapter(adapter, input.id);
        await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: collection.id,
          action: "read",
          locale: await resolveCmsPolicyLocale(adapter),
        });
        return AriaCollectionSchema.parse(collection);
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),

  create: defineAction({
    accept: "json",
    input: CreateCollectionRequestSchema,
    handler: async (input, context) => {
      const { user } = await resolveAuthorizedMutation(
        context,
        "cms.collections.create",
        "cms-collection-create",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        const collection = await createCollectionOnAdapter(adapter, input);
        await recordCmsAudit(adapter, {
          actor: user,
          action: "collection.create",
          collectionId: collection.id,
          summary: "Created CMS collection",
        });
        return AriaCollectionSchema.parse(collection);
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),

  update: defineAction({
    accept: "json",
    input: UpdateCollectionRequestSchema,
    handler: async (input, context) => {
      const { user } = await resolveAuthorizedMutation(
        context,
        "cms.collections.update",
        "cms-collection-update",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: input.id,
          action: "schema_edit",
          locale: await resolveCmsPolicyLocale(adapter),
        });
        const collection = await updateCollectionOnAdapter(adapter, input);
        await invalidateCollectionPublicCache(adapter, context, input.id);
        await recordCmsAudit(adapter, {
          actor: user,
          action: "collection.update",
          collectionId: collection.id,
          summary: "Updated CMS collection",
          metadata: { patchKeys: Object.keys(input.patch) },
        });
        return AriaCollectionSchema.parse(collection);
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),

  remove: defineAction({
    accept: "json",
    input: DeleteCollectionRequestSchema,
    handler: async (input, context) => {
      const { user, authorship } = await resolveAuthorizedMutation(
        context,
        "cms.collections.remove",
        "cms-collection-delete",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: input.id,
          action: "schema_edit",
          locale: await resolveCmsPolicyLocale(adapter),
        });
        await recordCmsAudit(adapter, {
          actor: user,
          action: "collection.delete",
          collectionId: input.id,
          summary: "Deleted CMS collection",
        });
        const result = await deleteCollectionOnAdapter(
          adapter,
          input.id,
          authorship,
        );
        for (const slug of result.updatedPageSlugs) {
          await invalidateComposeCache(
            context,
            "page",
            slug,
            undefined,
            "crud",
          );
        }
        return DeleteCollectionResponseSchema.parse(result);
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),

  deleteImpact: defineAction({
    accept: "json",
    input: GetCollectionDeleteImpactRequestSchema,
    handler: async (input, context) => {
      const user = await requireOperation(context, "cms.collections.remove");
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        await Promise.all(
          input.ids.map(async (collectionId) =>
            requireCmsCollectionPolicy(adapter, {
              actor: user,
              collectionId,
              action: "schema_edit",
              locale: await resolveCmsPolicyLocale(adapter),
            }),
          ),
        );
        const impact = await getCollectionDeleteImpactOnAdapter(
          adapter,
          input.ids,
        );
        return GetCollectionDeleteImpactResponseSchema.parse(impact);
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),

  compileSchema: defineAction({
    accept: "json",
    input: CompileSchemaRequestSchema,
    handler: async (input, context) => {
      const user = await requireOperation(
        context,
        "cms.collections.compileSchema",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        const collection = await getCollectionFromAdapter(adapter, input.id);
        await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: collection.id,
          action: "schema_edit",
          locale: await resolveCmsPolicyLocale(adapter),
        });
        const result = compileCollectionSchemaForCollection(collection);
        return CompileSchemaResponseSchema.parse(result);
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),

  setTemplate: defineAction({
    accept: "json",
    input: SetCollectionTemplateRequestSchema,
    handler: async (input, context) => {
      const { user } = await resolveAuthorizedMutation(
        context,
        "cms.collections.setTemplate",
        "cms-collection-update",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: input.collectionId,
          action: "schema_edit",
          locale: await resolveCmsPolicyLocale(adapter),
        });
        const collection = await setCollectionTemplateOnAdapter(adapter, input);
        await invalidateCollectionPublicCache(
          adapter,
          context,
          input.collectionId,
        );
        await recordCmsAudit(adapter, {
          actor: user,
          action: "collection.set_template",
          collectionId: collection.id,
          summary: "Updated CMS collection template",
        });
        return AriaCollectionSchema.parse(collection);
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),

  clearTemplate: defineAction({
    accept: "json",
    input: ClearCollectionTemplateRequestSchema,
    handler: async (input, context) => {
      const { user } = await resolveAuthorizedMutation(
        context,
        "cms.collections.clearTemplate",
        "cms-collection-update",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: input.collectionId,
          action: "schema_edit",
          locale: await resolveCmsPolicyLocale(adapter),
        });
        const collection = await clearCollectionTemplateOnAdapter(
          adapter,
          input.collectionId,
        );
        await invalidateCollectionPublicCache(
          adapter,
          context,
          input.collectionId,
        );
        await recordCmsAudit(adapter, {
          actor: user,
          action: "collection.clear_template",
          collectionId: collection.id,
          summary: "Cleared CMS collection template",
        });
        return AriaCollectionSchema.parse(collection);
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),

  listPermissions: defineAction({
    accept: "json",
    input: ListCollectionPermissionsRequestSchema,
    handler: async (input, context) => {
      const user = await requireOperation(context, "cms.collections.get");
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: input.collectionId,
          action: "schema_edit",
          locale: await resolveCmsPolicyLocale(adapter),
        });
        const permissions = await listCollectionPermissionsFromAdapter(
          adapter,
          input.collectionId,
        );
        return ListCollectionPermissionsResponseSchema.parse({ permissions });
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),

  setPermissions: defineAction({
    accept: "json",
    input: SetCollectionPermissionsRequestSchema,
    handler: async (input, context) => {
      const { user } = await resolveAuthorizedMutation(
        context,
        "cms.collections.update",
        "cms-collection-update",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: input.collectionId,
          action: "schema_edit",
          locale: await resolveCmsPolicyLocale(adapter),
        });
        const permissions = await replaceCollectionPermissionsOnAdapter(
          adapter,
          input.collectionId,
          input.permissions,
        );
        await recordCmsAudit(adapter, {
          actor: user,
          action: "collection.permissions.update",
          collectionId: input.collectionId,
          summary: "Updated legacy collection permissions",
          metadata: { permissionCount: permissions.length },
        });
        return SetCollectionPermissionsResponseSchema.parse({ permissions });
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),

  getPolicy: defineAction({
    accept: "json",
    input: GetCollectionPolicyRequestSchema,
    handler: async (input, context) => {
      const user = await requireOperation(context, "cms.collections.get");
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: input.collectionId,
          action: "schema_edit",
          locale: await resolveCmsPolicyLocale(adapter),
        });
        return CollectionPolicyResponseSchema.parse({
          policy: await getCollectionPolicyFromAdapter(
            adapter,
            input.collectionId,
          ),
        });
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),

  listPolicyPrincipals: defineAction({
    accept: "json",
    input: GetCollectionPolicyRequestSchema,
    handler: async (input, context) => {
      const user = await requireOperation(context, "cms.collections.get");
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: input.collectionId,
          action: "schema_edit",
          locale: await resolveCmsPolicyLocale(adapter),
        });
        const authAdapter = await getAuthAdapterAsync(context.locals);
        const usersById = new Map(
          (await authAdapter.listUsers()).map((candidate) => [
            candidate.id,
            {
              id: candidate.id,
              username: candidate.username,
              role: candidate.role,
            },
          ]),
        );
        // A valid session can outlive an adapter migration or external-auth sync.
        // Keep the current schema editor selectable even if that adapter omits it.
        usersById.set(user.id, {
          id: user.id,
          username: user.username,
          role: user.role,
        });
        return ListCollectionPolicyPrincipalsResponseSchema.parse({
          users: [...usersById.values()],
        });
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),

  setPolicy: defineAction({
    accept: "json",
    input: SetCollectionPolicyRequestSchema,
    handler: async (input, context) => {
      const { user } = await resolveAuthorizedMutation(
        context,
        "cms.collections.update",
        "cms-collection-update",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: input.collectionId,
          action: "schema_edit",
          locale: await resolveCmsPolicyLocale(adapter),
        });
        const policy = await saveCollectionPolicyOnAdapter(adapter, input);
        await recordCmsAudit(adapter, {
          actor: user,
          action: "collection.policy.update",
          collectionId: input.collectionId,
          summary: "Updated collection access policy",
          metadata: { mode: policy.mode, ruleCount: policy.rules.length },
        });
        return CollectionPolicyResponseSchema.parse({ policy });
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),

  access: defineAction({
    accept: "json",
    input: GetCollectionAccessRequestSchema,
    handler: async (input, context) => {
      const user = await requireOperation(context, "cms.collections.get");
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        const entry = input.entryId
          ? await getEntryFromAdapter(adapter, {
              collectionId: input.collectionId,
              idOrSlug: input.entryId,
            })
          : undefined;
        return CollectionAccessResponseSchema.parse(
          await inspectCollectionAccessFromAdapter(adapter, {
            collectionId: input.collectionId,
            actor: user,
            locale: input.locale ?? (await resolveCmsPolicyLocale(adapter)),
            entry,
          }),
        );
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),

  listAudit: defineAction({
    accept: "json",
    input: ListCmsAuditEventsRequestSchema,
    handler: async (input, context) => {
      const user = await requireOperation(context, "cms.collections.get");
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        if (!input.collectionId) {
          throw new CmsServiceError(
            "FORBIDDEN",
            "Audit events must be requested for a specific collection",
          );
        }
        if (user.role !== "administrator") {
          await requireCmsCollectionPolicy(adapter, {
            actor: user,
            collectionId: input.collectionId,
            action: "schema_edit",
            locale: await resolveCmsPolicyLocale(adapter),
          });
        }
        return ListCmsAuditEventsResponseSchema.parse({
          events: await adapter.listCmsAuditEvents(input),
        });
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),
};
