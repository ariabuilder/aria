import type { SessionUser } from "../../lib/auth/types";
import type { StorageAdapter } from "../../lib/storage/adapter";
import {
  appendCmsAuditEvent,
  assertCmsPolicyAllowed,
  evaluateCmsPolicy,
  type CmsPolicyAction,
} from "../../lib/cms/services/accessPolicy";
import type { AriaEntryRecord } from "../../lib/cms/schemas";
import {
  getContentLocaleSettings,
  resolveEntryLocaleFromAdapter,
} from "../../lib/cms/services/entries";
import { resolveSourceLocale } from "../../lib/cms/entryProjection";

export async function resolveCmsPolicyLocale(
  adapter: StorageAdapter,
  record?: AriaEntryRecord,
  requestedLocale?: string,
): Promise<string> {
  if (!record) {
    return (
      requestedLocale?.trim() ||
      (await getContentLocaleSettings(adapter)).defaultLocale
    );
  }
  const resolved = await resolveEntryLocaleFromAdapter(
    adapter,
    record,
    requestedLocale,
  );
  return (
    resolved?.resolvedLocale ?? resolveSourceLocale(record)?.locale ?? "en"
  );
}

export async function requireCmsCollectionPolicy(
  adapter: StorageAdapter,
  input: {
    actor: SessionUser;
    collectionId: string;
    action: CmsPolicyAction;
    locale?: string;
    entry?: Pick<AriaEntryRecord, "entry">;
    allowDenied?: boolean;
  },
) {
  const decision = await evaluateCmsPolicy(adapter, input);
  if (!decision.allowed) {
    await appendCmsAuditEvent(adapter, {
      action: "access.denied",
      actorId: input.actor.id,
      actorUsername: input.actor.username,
      collectionId: input.collectionId,
      entryId: input.entry?.entry.id,
      summary: `Denied ${input.action} by collection policy`,
      metadata: {
        policyMode: decision.policy.mode,
        policyReason: decision.reason ?? "policy_restricted",
        requestedAction: input.action,
        locale: input.locale,
      },
    });
  }
  if (!input.allowDenied) {
    assertCmsPolicyAllowed(decision);
  }
  return decision;
}

export async function recordCmsAudit(
  adapter: StorageAdapter,
  input: {
    actor: SessionUser;
    action: string;
    collectionId?: string;
    entryId?: string;
    summary: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await appendCmsAuditEvent(adapter, {
    action: input.action,
    actorId: input.actor.id,
    actorUsername: input.actor.username,
    collectionId: input.collectionId,
    entryId: input.entryId,
    summary: input.summary,
    metadata: input.metadata ?? {},
  });
}
