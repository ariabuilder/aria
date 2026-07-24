import type {
  AriaCollectionPolicy,
  CmsAuditEvent,
} from "../schemas";
import type { CollectionPermissionAction } from "../constants";
import {
  AriaCollectionPolicySchema,
  CmsAuditEventSchema,
  CollectionPermissionSchema,
} from "../schemas";
import type { CmsStorageExecutor } from "./executor";

type CollectionPermissionRow = {
  principal_id: string;
  collection_id: string;
  action: string;
};

export async function cmsListCollectionPermissions(
  executor: CmsStorageExecutor,
  collectionId: string,
): Promise<Array<{ principalId: string; collectionId: string; action: CollectionPermissionAction }>> {
  const rows = await executor.queryAll<CollectionPermissionRow>(
    `SELECT principal_id, collection_id, action
     FROM aria_collection_permissions
     WHERE collection_id = ?
     ORDER BY principal_id ASC, action ASC`,
    [collectionId],
  );
  return rows.map((row) => CollectionPermissionSchema.parse({
    principalId: row.principal_id,
    collectionId: row.collection_id,
    action: row.action,
  }));
}

export async function cmsReplaceCollectionPermissions(
  executor: CmsStorageExecutor,
  collectionId: string,
  permissions: ReadonlyArray<{ principalId: string; action: CollectionPermissionAction }>,
): Promise<void> {
  await executor.run(
    `DELETE FROM aria_collection_permissions WHERE collection_id = ?`,
    [collectionId],
  );
  for (const permission of permissions) {
    const parsed = CollectionPermissionSchema.parse({
      principalId: permission.principalId,
      collectionId,
      action: permission.action,
    });
    await executor.run(
      `INSERT INTO aria_collection_permissions (principal_id, collection_id, action)
       VALUES (?, ?, ?)`,
      [parsed.principalId, parsed.collectionId, parsed.action],
    );
  }
}

type CollectionPolicyRow = {
  collection_id: string;
  mode: string;
  rules_json: string;
  updated_at: string;
};

type CmsAuditEventRow = {
  id: string;
  action: string;
  actor_id: string;
  actor_username: string | null;
  collection_id: string | null;
  entry_id: string | null;
  summary: string;
  metadata_json: string;
  created_at: string;
};

function defaultCollectionPolicy(collectionId: string): AriaCollectionPolicy {
  return AriaCollectionPolicySchema.parse({
    collectionId,
    mode: "inherit",
    rules: [],
    updatedAt: new Date(0).toISOString(),
  });
}

export async function cmsGetCollectionPolicy(
  executor: CmsStorageExecutor,
  collectionId: string,
): Promise<AriaCollectionPolicy> {
  const row = await executor.queryFirst<CollectionPolicyRow>(
    `SELECT collection_id, mode, rules_json, updated_at
     FROM aria_collection_policies
     WHERE collection_id = ?
     LIMIT 1`,
    [collectionId],
  );
  if (!row) return defaultCollectionPolicy(collectionId);
  return AriaCollectionPolicySchema.parse({
    collectionId: row.collection_id,
    mode: row.mode,
    rules: JSON.parse(row.rules_json),
    updatedAt: row.updated_at,
  });
}

export async function cmsSaveCollectionPolicy(
  executor: CmsStorageExecutor,
  policy: AriaCollectionPolicy,
): Promise<AriaCollectionPolicy> {
  const parsed = AriaCollectionPolicySchema.parse(policy);
  await executor.run(
    `INSERT INTO aria_collection_policies (collection_id, mode, rules_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(collection_id) DO UPDATE SET
       mode = excluded.mode,
       rules_json = excluded.rules_json,
       updated_at = excluded.updated_at`,
    [parsed.collectionId, parsed.mode, JSON.stringify(parsed.rules), parsed.updatedAt],
  );
  return parsed;
}

export async function cmsAppendAuditEvent(
  executor: CmsStorageExecutor,
  event: CmsAuditEvent,
): Promise<void> {
  const parsed = CmsAuditEventSchema.parse(event);
  await executor.run(
    `INSERT INTO aria_cms_audit_events
       (id, action, actor_id, actor_username, collection_id, entry_id, summary, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      parsed.id, parsed.action, parsed.actorId, parsed.actorUsername ?? null,
      parsed.collectionId ?? null, parsed.entryId ?? null, parsed.summary,
      JSON.stringify(parsed.metadata), parsed.createdAt,
    ],
  );
}

export async function cmsListAuditEvents(
  executor: CmsStorageExecutor,
  options: { collectionId?: string; entryId?: string; limit?: number } = {},
): Promise<CmsAuditEvent[]> {
  const filters: string[] = [];
  const args: unknown[] = [];
  if (options.collectionId) {
    filters.push("collection_id = ?");
    args.push(options.collectionId);
  }
  if (options.entryId) {
    filters.push("entry_id = ?");
    args.push(options.entryId);
  }
  const limit = Math.max(1, Math.min(options.limit ?? 100, 500));
  args.push(limit);
  const rows = await executor.queryAll<CmsAuditEventRow>(
    `SELECT id, action, actor_id, actor_username, collection_id, entry_id,
            summary, metadata_json, created_at
     FROM aria_cms_audit_events
     ${filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : ""}
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
    args,
  );
  return rows.map((row) => CmsAuditEventSchema.parse({
    id: row.id,
    action: row.action,
    actorId: row.actor_id,
    actorUsername: row.actor_username ?? undefined,
    collectionId: row.collection_id ?? undefined,
    entryId: row.entry_id ?? undefined,
    summary: row.summary,
    metadata: JSON.parse(row.metadata_json),
    createdAt: row.created_at,
  }));
}
