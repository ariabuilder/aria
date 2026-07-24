import type {
  CmsEntryAutosave,
  CmsEntryEditLock,
  CmsEntryPresenceLease,
} from "../schemas";
import {
  CmsEntryAutosaveSchema,
  CmsEntryEditLockSchema,
  CmsEntryPresenceLeaseSchema,
} from "../schemas";
import type { CmsStorageExecutor } from "./executor";

type CmsEntryAutosaveRow = {
  id: string; entry_id: string; collection_id: string; locale: string;
  base_version: string; actor_id: string; client_sequence: number;
  payload_json: string; checksum: string; created_at: string; expires_at: string;
};

function mapCmsEntryAutosave(row: CmsEntryAutosaveRow): CmsEntryAutosave {
  return CmsEntryAutosaveSchema.parse({
    id: row.id, entryId: row.entry_id, collectionId: row.collection_id,
    locale: row.locale, baseVersion: row.base_version, actorId: row.actor_id,
    clientSequence: row.client_sequence, payload: JSON.parse(row.payload_json),
    checksum: row.checksum, createdAt: row.created_at, expiresAt: row.expires_at,
  });
}

export async function cmsSaveEntryAutosave(
  executor: CmsStorageExecutor,
  autosave: CmsEntryAutosave,
): Promise<CmsEntryAutosave | null> {
  const parsed = CmsEntryAutosaveSchema.parse(autosave);
  const serializedPayload = JSON.stringify(parsed.payload);
  if (serializedPayload.length > 200_000) {
    throw new Error("Autosave payload exceeds 200KB");
  }
  await executor.run(
    `INSERT INTO aria_cms_entry_autosaves
       (id, entry_id, collection_id, locale, base_version, actor_id, client_sequence, payload_json, checksum, created_at, expires_at)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
     WHERE NOT EXISTS (
       SELECT 1 FROM aria_cms_entry_autosaves
       WHERE entry_id = ? AND locale = ? AND actor_id = ? AND client_sequence >= ?
     )`,
    [parsed.id, parsed.entryId, parsed.collectionId, parsed.locale, parsed.baseVersion,
      parsed.actorId, parsed.clientSequence, serializedPayload, parsed.checksum,
      parsed.createdAt, parsed.expiresAt, parsed.entryId, parsed.locale,
      parsed.actorId, parsed.clientSequence],
  );
  const latest = await executor.queryFirst<CmsEntryAutosaveRow>(
    `SELECT * FROM aria_cms_entry_autosaves
     WHERE entry_id = ? AND locale = ? AND actor_id = ?
     ORDER BY client_sequence DESC, created_at DESC LIMIT 1`,
    [parsed.entryId, parsed.locale, parsed.actorId],
  );
  return latest?.id === parsed.id ? mapCmsEntryAutosave(latest) : null;
}

export async function cmsGetLatestEntryAutosave(
  executor: CmsStorageExecutor,
  input: { entryId: string; locale: string; actorId: string; now: string },
): Promise<CmsEntryAutosave | null> {
  const row = await executor.queryFirst<CmsEntryAutosaveRow>(
    `SELECT * FROM aria_cms_entry_autosaves
     WHERE entry_id = ? AND locale = ? AND actor_id = ? AND expires_at > ?
     ORDER BY client_sequence DESC, created_at DESC LIMIT 1`,
    [input.entryId, input.locale, input.actorId, input.now],
  );
  return row ? mapCmsEntryAutosave(row) : null;
}

export async function cmsPruneEntryAutosaves(
  executor: CmsStorageExecutor,
  now: string,
): Promise<void> {
  await executor.run(`DELETE FROM aria_cms_entry_autosaves WHERE expires_at <= ?`, [now]);
}

type CmsEntryLeaseRow = {
  entry_id: string; locale: string; actor_id: string; lease_token: string;
  expires_at: string; updated_at: string;
};

function mapCmsEntryLease(row: CmsEntryLeaseRow): CmsEntryPresenceLease {
  return CmsEntryPresenceLeaseSchema.parse({
    entryId: row.entry_id, locale: row.locale, actorId: row.actor_id,
    leaseToken: row.lease_token, expiresAt: row.expires_at, updatedAt: row.updated_at,
  });
}

export async function cmsUpsertEntryPresenceLease(
  executor: CmsStorageExecutor,
  lease: CmsEntryPresenceLease,
): Promise<void> {
  const parsed = CmsEntryPresenceLeaseSchema.parse(lease);
  await executor.run(
    `INSERT INTO aria_cms_entry_presence_leases
       (entry_id, locale, actor_id, lease_token, expires_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(entry_id, locale, actor_id) DO UPDATE SET
       lease_token = excluded.lease_token, expires_at = excluded.expires_at, updated_at = excluded.updated_at`,
    [parsed.entryId, parsed.locale, parsed.actorId, parsed.leaseToken, parsed.expiresAt, parsed.updatedAt],
  );
}

export async function cmsListEntryPresenceLeases(
  executor: CmsStorageExecutor,
  input: { entryId: string; locale: string; now: string },
): Promise<CmsEntryPresenceLease[]> {
  const rows = await executor.queryAll<CmsEntryLeaseRow>(
    `SELECT * FROM aria_cms_entry_presence_leases
     WHERE entry_id = ? AND locale = ? AND expires_at > ? ORDER BY updated_at ASC`,
    [input.entryId, input.locale, input.now],
  );
  return rows.map(mapCmsEntryLease);
}

export async function cmsAcquireEntryEditLock(
  executor: CmsStorageExecutor,
  input: CmsEntryEditLock & { now: string },
): Promise<CmsEntryEditLock | null> {
  const parsed = CmsEntryEditLockSchema.parse({
    entryId: input.entryId, locale: input.locale, actorId: input.actorId,
    leaseToken: input.leaseToken, expiresAt: input.expiresAt, updatedAt: input.updatedAt,
  });
  await executor.run(
    `INSERT INTO aria_cms_entry_edit_locks
       (entry_id, locale, actor_id, lease_token, expires_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(entry_id, locale) DO UPDATE SET
       actor_id = excluded.actor_id, lease_token = excluded.lease_token,
       expires_at = excluded.expires_at, updated_at = excluded.updated_at
     WHERE aria_cms_entry_edit_locks.expires_at <= ?
        OR (aria_cms_entry_edit_locks.actor_id = excluded.actor_id
            AND aria_cms_entry_edit_locks.lease_token = excluded.lease_token)`,
    [parsed.entryId, parsed.locale, parsed.actorId, parsed.leaseToken,
      parsed.expiresAt, parsed.updatedAt, input.now],
  );
  const row = await executor.queryFirst<CmsEntryLeaseRow>(
    `SELECT * FROM aria_cms_entry_edit_locks WHERE entry_id = ? AND locale = ?`,
    [parsed.entryId, parsed.locale],
  );
  if (!row || row.lease_token !== parsed.leaseToken || row.actor_id !== parsed.actorId) return null;
  return CmsEntryEditLockSchema.parse(mapCmsEntryLease(row));
}

export async function cmsReleaseEntryEditLock(
  executor: CmsStorageExecutor,
  input: { entryId: string; locale: string; leaseToken: string },
): Promise<void> {
  await executor.run(
    `DELETE FROM aria_cms_entry_edit_locks WHERE entry_id = ? AND locale = ? AND lease_token = ?`,
    [input.entryId, input.locale, input.leaseToken],
  );
}
