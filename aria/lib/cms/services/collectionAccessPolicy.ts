import type { SessionUser } from "../../auth/types";
import type { StorageAdapter } from "../../storage/adapter";
import {
  AriaCollectionPolicySchema,
  type AriaCollectionPolicy,
  type AriaEntryRecord,
  type CollectionPolicyRule,
} from "../schemas";
import { getCollectionFromAdapter } from "./collections";
import { evaluateCmsPolicy, type CmsPolicyAction } from "./accessPolicy";
import { getContentLocaleSettings } from "./entries";
import { CmsServiceError } from "../errors";

const CMS_POLICY_ACTIONS: readonly CmsPolicyAction[] = [
  "read",
  "create",
  "update",
  "delete",
  "publish",
  "schema_edit",
  "tag_create",
];

export async function getCollectionPolicyFromAdapter(
  adapter: StorageAdapter,
  collectionId: string,
): Promise<AriaCollectionPolicy> {
  await getCollectionFromAdapter(adapter, collectionId);
  return AriaCollectionPolicySchema.parse(
    await adapter.getCollectionPolicy(collectionId),
  );
}

export async function saveCollectionPolicyOnAdapter(
  adapter: StorageAdapter,
  input: {
    collectionId: string;
    mode: AriaCollectionPolicy["mode"];
    rules: CollectionPolicyRule[];
  },
): Promise<AriaCollectionPolicy> {
  const collection = await getCollectionFromAdapter(
    adapter,
    input.collectionId,
  );
  const allowedFields = new Set([
    "title",
    "slug",
    ...(collection.supports.includes("body") ? ["body"] : []),
    ...collection.schema.fields.map((field) => field.key),
  ]);
  const allowedLocales = new Set(
    (await getContentLocaleSettings(adapter)).locales
      .filter((locale) => locale.enabled)
      .map((locale) => locale.code),
  );
  for (const rule of input.rules) {
    for (const locale of rule.locales) {
      if (!allowedLocales.has(locale)) {
        throw new CmsServiceError(
          "VALIDATION_ERROR",
          `Policy locale is not configured: ${locale}`,
        );
      }
    }
    for (const field of [
      ...(rule.visibleFields ?? []),
      ...(rule.editableFields ?? []),
    ]) {
      if (!allowedFields.has(field)) {
        throw new CmsServiceError(
          "VALIDATION_ERROR",
          `Policy field is not available on this collection: ${field}`,
        );
      }
    }
  }
  return adapter.saveCollectionPolicy(
    AriaCollectionPolicySchema.parse({
      ...input,
      updatedAt: new Date().toISOString(),
    }),
  );
}

export async function inspectCollectionAccessFromAdapter(
  adapter: StorageAdapter,
  input: {
    collectionId: string;
    actor: SessionUser;
    locale?: string;
    entry?: Pick<AriaEntryRecord, "entry">;
  },
) {
  const decisions = await Promise.all(
    CMS_POLICY_ACTIONS.map(
      async (action) =>
        [
          action,
          await evaluateCmsPolicy(adapter, { ...input, action }),
        ] as const,
    ),
  );
  const byAction = new Map(decisions);
  const read = byAction.get("read");
  if (!read) throw new Error("CMS read policy was not evaluated");

  return {
    allowed: read.allowed,
    mode: read.policy.mode,
    actions: Object.fromEntries(
      decisions.map(([action, decision]) => [action, decision.allowed]),
    ),
    visibleFields: read.visibleFields ? [...read.visibleFields].sort() : [],
    editableFields: read.editableFields ? [...read.editableFields].sort() : [],
    allowedLocales: read.allowedLocales ? [...read.allowedLocales].sort() : [],
    unrestrictedFields: read.visibleFields === null,
    unrestrictedLocales: read.allowedLocales === null,
    requiresOwnEntry: read.requiresOwnEntry,
  };
}
