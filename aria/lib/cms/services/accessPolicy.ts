import { generateId } from "../../crypto";
import type { SessionUser } from "../../auth/types";
import type { StorageAdapter } from "../../storage/adapter";
import { CmsServiceError } from "../errors";
import {
  AriaCollectionPolicySchema,
  AriaEntryRecordSchema,
  AriaEntryRevisionSchema,
  type AriaCollectionPolicy,
  type AriaEntryRecord,
  type AriaEntryRevision,
  type CmsAuditEvent,
  type CollectionPolicyRule,
} from "../schemas";
import type { CollectionPermissionAction } from "../constants";
import { getCollectionFromAdapter } from "./collections";

export type CmsPolicyAction = CollectionPermissionAction;

export type CmsPolicyDecision = {
  allowed: boolean;
  policy: AriaCollectionPolicy;
  visibleFields: ReadonlySet<string> | null;
  editableFields: ReadonlySet<string> | null;
  allowedLocales: ReadonlySet<string> | null;
  requiresOwnEntry: boolean;
  reason?: "policy_restricted" | "document_scope" | "locale_scope";
};

type EvaluateCmsPolicyInput = {
  collectionId: string;
  actor: Pick<SessionUser, "id" | "role">;
  action: CmsPolicyAction;
  locale?: string;
  entry?: Pick<AriaEntryRecord, "entry">;
};

function unrestrictedDecision(policy: AriaCollectionPolicy): CmsPolicyDecision {
  return {
    allowed: true,
    policy,
    visibleFields: null,
    editableFields: null,
    allowedLocales: null,
    requiresOwnEntry: false,
  };
}

function ruleAllowsLocale(
  rule: CollectionPolicyRule,
  locale: string | undefined,
): boolean {
  return (
    rule.locales.length === 0 ||
    (locale !== undefined && rule.locales.includes(locale))
  );
}

function isOwnEntry(
  entry: Pick<AriaEntryRecord, "entry"> | undefined,
  actorId: string,
): boolean {
  return !entry || entry.entry.authorId === actorId;
}

function unionFields(
  rules: readonly CollectionPolicyRule[],
  key: "visibleFields" | "editableFields",
): ReadonlySet<string> | null {
  if (rules.some((rule) => rule[key] === undefined)) return null;
  return new Set(rules.flatMap((rule) => rule[key] ?? []));
}

function unionLocales(
  rules: readonly CollectionPolicyRule[],
): ReadonlySet<string> | null {
  if (rules.some((rule) => rule.locales.length === 0)) return null;
  return new Set(rules.flatMap((rule) => rule.locales));
}

export async function evaluateCmsPolicy(
  adapter: StorageAdapter,
  input: EvaluateCmsPolicyInput,
): Promise<CmsPolicyDecision> {
  await getCollectionFromAdapter(adapter, input.collectionId);
  const policy = AriaCollectionPolicySchema.parse(
    await adapter.getCollectionPolicy(input.collectionId),
  );

  // Administrators are the recovery principal for a restricted collection.
  if (policy.mode === "inherit" || input.actor.role === "administrator") {
    return unrestrictedDecision(policy);
  }

  const principalRules = policy.rules.filter(
    (rule) =>
      rule.principalId === input.actor.id &&
      rule.actions.includes(input.action) &&
      ruleAllowsLocale(rule, input.locale),
  );
  if (principalRules.length === 0) {
    return {
      allowed: false,
      policy,
      visibleFields: new Set(),
      editableFields: new Set(),
      allowedLocales: new Set(),
      requiresOwnEntry: false,
      reason: input.locale ? "locale_scope" : "policy_restricted",
    };
  }

  const matchingRules = principalRules.filter(
    (rule) =>
      rule.documentScope === "all" || isOwnEntry(input.entry, input.actor.id),
  );
  if (matchingRules.length === 0) {
    return {
      allowed: false,
      policy,
      visibleFields: new Set(),
      editableFields: new Set(),
      allowedLocales: unionLocales(principalRules),
      requiresOwnEntry: true,
      reason: "document_scope",
    };
  }

  return {
    allowed: true,
    policy,
    visibleFields: unionFields(matchingRules, "visibleFields"),
    editableFields: unionFields(matchingRules, "editableFields"),
    allowedLocales: unionLocales(matchingRules),
    requiresOwnEntry: matchingRules.every(
      (rule) => rule.documentScope === "own",
    ),
  };
}

export function assertCmsPolicyAllowed(decision: CmsPolicyDecision): void {
  if (decision.allowed) return;
  throw new CmsServiceError(
    "FORBIDDEN",
    "Collection access policy denied this operation",
  );
}

function restrictLocale(
  record: AriaEntryRecord,
  allowedLocales: ReadonlySet<string> | null,
): AriaEntryRecord["locales"] {
  return allowedLocales
    ? record.locales.filter((locale) => allowedLocales.has(locale.locale))
    : record.locales;
}

function projectLocaleFields(
  locale: AriaEntryRecord["locales"][number],
  visibleFields: ReadonlySet<string> | null,
): AriaEntryRecord["locales"][number] {
  if (!visibleFields) return locale;
  const frontmatter = Object.fromEntries(
    Object.entries(locale.frontmatter).filter(([key]) =>
      visibleFields.has(key),
    ),
  );
  return {
    ...locale,
    title: visibleFields.has("title") ? locale.title : "",
    // Slug is structural: an empty value would violate the entry locale schema.
    slug: visibleFields.has("slug") ? locale.slug : "restricted",
    body: visibleFields.has("body") ? locale.body : null,
    frontmatter,
  };
}

export function projectCmsEntryRecord(
  record: AriaEntryRecord,
  decision: CmsPolicyDecision,
): AriaEntryRecord | null {
  if (!decision.allowed) return null;
  const locales = restrictLocale(record, decision.allowedLocales).map(
    (locale) => projectLocaleFields(locale, decision.visibleFields),
  );
  if (locales.length === 0) return null;
  return AriaEntryRecordSchema.parse({ ...record, locales });
}

export function projectCmsEntryRevision(
  revision: AriaEntryRevision,
  decision: CmsPolicyDecision,
): AriaEntryRevision | null {
  const projected = projectCmsEntryRecord(
    {
      entry: revision.snapshot.entry,
      locales: revision.snapshot.locales,
      relations: revision.snapshot.relations,
    },
    decision,
  );
  if (!projected) return null;
  return AriaEntryRevisionSchema.parse({
    ...revision,
    snapshot: {
      entry: projected.entry,
      locales: projected.locales,
      relations: projected.relations,
    },
  });
}

export function assertCmsFieldMutationAllowed(
  decision: CmsPolicyDecision,
  fields: Iterable<string>,
): void {
  assertCmsPolicyAllowed(decision);
  if (!decision.editableFields) return;
  for (const field of fields) {
    if (!decision.editableFields.has(field)) {
      throw new CmsServiceError(
        "FORBIDDEN",
        `Collection access policy does not allow editing ${field}`,
      );
    }
  }
}

export function changedEntryPatchFields(
  patch: Record<string, unknown>,
): string[] {
  const fields: string[] = [];
  if (Object.prototype.hasOwnProperty.call(patch, "title"))
    fields.push("title");
  if (Object.prototype.hasOwnProperty.call(patch, "slug")) fields.push("slug");
  if (Object.prototype.hasOwnProperty.call(patch, "body")) fields.push("body");
  if (Object.prototype.hasOwnProperty.call(patch, "commentsClosed")) {
    fields.push("commentsClosed");
  }
  const relations = patch.relations;
  if (Array.isArray(relations)) {
    for (const relation of relations) {
      if (
        relation &&
        typeof relation === "object" &&
        typeof (relation as { fieldKey?: unknown }).fieldKey === "string"
      ) {
        fields.push((relation as { fieldKey: string }).fieldKey);
      }
    }
  }
  const frontmatter = patch.frontmatter;
  if (
    frontmatter &&
    typeof frontmatter === "object" &&
    !Array.isArray(frontmatter)
  ) {
    fields.push(...Object.keys(frontmatter));
  }
  return fields;
}

export async function appendCmsAuditEvent(
  adapter: StorageAdapter,
  input: Omit<CmsAuditEvent, "id" | "createdAt">,
): Promise<void> {
  await adapter.appendCmsAuditEvent(createCmsAuditEvent(input));
}

export function createCmsAuditEvent(
  input: Omit<CmsAuditEvent, "id" | "createdAt">,
): CmsAuditEvent {
  return {
    ...input,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };
}
