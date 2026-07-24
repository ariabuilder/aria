import {
  AriaEntryRecordSchema,
  AriaEntryRevisionSchema,
  CmsAuditEventSchema,
  type AriaEntryAuthorDisplay,
  type AriaEntryRecord,
} from "../schemas";
import type { CmsEntryMutationCommitInput } from "../../storage/adapter";
import {
  entryLocaleToRow,
  entryRelationToRow,
  entryToRow,
  mapEntryAuthorshipFromRow,
  mapEntryLocaleRow,
  mapEntryRelationRow,
  mapEntryRow,
} from "./db";
import { cmsGetEntry } from "./entries";
import { runCmsBatch, type CmsStorageExecutor } from "./executor";
import { ensureCmsTranslationSchema } from "./schema";
import { buildIntegrationEventStatements } from "../../integrations/events";

type SqlStatement = { sql: string; args?: readonly unknown[] };

function actorColumns(actor: AriaEntryAuthorDisplay | null | undefined) {
  return {
    id: actor?.id ?? null,
    username: actor?.username ?? null,
    email: actor?.email ?? null,
    avatarUrl: actor?.avatarUrl?.trim() || null,
  };
}

/** Match the record projection returned after a SQL round-trip. */
export function normalizeEntryRecordForStorage(
  rawRecord: AriaEntryRecord,
): ReturnType<typeof AriaEntryRecordSchema.parse> {
  const record = AriaEntryRecordSchema.parse(rawRecord);
  const entryRow = entryToRow(record.entry);
  const createdBy = actorColumns(
    record.authorship?.createdBy ?? record.authorship?.author,
  );
  const updatedBy = actorColumns(
    record.authorship?.updatedBy ?? record.authorship?.author,
  );
  const publishedBy = actorColumns(record.authorship?.publishedBy);
  const storedEntryRow = {
    ...entryRow,
    created_by_id: createdBy.id,
    created_by_username: createdBy.username,
    created_by_email: createdBy.email,
    updated_by_id: updatedBy.id,
    updated_by_username: updatedBy.username,
    updated_by_email: updatedBy.email,
    published_by_id: publishedBy.id,
    published_by_username: publishedBy.username,
    published_by_email: publishedBy.email,
  };
  const authorship = mapEntryAuthorshipFromRow(storedEntryRow);
  return AriaEntryRecordSchema.parse({
    entry: mapEntryRow(storedEntryRow),
    locales: record.locales.map((locale) =>
      mapEntryLocaleRow(
        entryLocaleToRow({
          ...locale,
          entryId: record.entry.id,
          collectionId: record.entry.collectionId,
        }),
      ),
    ),
    relations: record.relations?.map((relation) =>
      mapEntryRelationRow(
        entryRelationToRow({
          ...relation,
          sourceEntryId: record.entry.id,
        }),
      ),
    ),
    ...(authorship ? { authorship } : {}),
  });
}

function leaseGuard(input: CmsEntryMutationCommitInput): {
  sql: string;
  args: readonly unknown[];
} {
  if (!input.api) return { sql: "1 = 1", args: [] };
  return {
    sql: `EXISTS (
      SELECT 1 FROM aria_api_idempotency
      WHERE credential_id = ? AND idempotency_key = ?
        AND request_fingerprint = ? AND state = 'processing'
        AND lease_token = ? AND lease_expires_at > ?
    )`,
    args: [
      input.api.credentialId,
      input.api.key,
      input.api.fingerprint,
      input.api.leaseToken,
      input.api.committedAt,
    ],
  };
}

function appliedGuard(
  recordId: string,
  version: string,
): {
  sql: string;
  args: readonly unknown[];
} {
  return {
    sql: "EXISTS (SELECT 1 FROM aria_entries WHERE id = ? AND version = ?)",
    args: [recordId, version],
  };
}

/**
 * Commits the canonical CMS row, revision, CMS audit, and optional
 * REST idempotency response as one SQLite/D1 batch. Every dependent.
 */
export async function cmsCommitEntryMutation(
  executor: CmsStorageExecutor,
  rawInput: CmsEntryMutationCommitInput,
): Promise<ReturnType<typeof AriaEntryRecordSchema.parse>> {
  await ensureCmsTranslationSchema(executor);
  const input: CmsEntryMutationCommitInput = {
    ...rawInput,
    record: normalizeEntryRecordForStorage(rawInput.record),
    revision: AriaEntryRevisionSchema.parse(rawInput.revision),
    auditEvent: CmsAuditEventSchema.parse(rawInput.auditEvent),
  };
  const record = input.record;
  if ((input.api || input.integrationEvent) && !executor.batch) {
    throw new Error(
      "Atomic API entry mutations require transactional batch storage",
    );
  }
  const existing = await executor.queryFirst<{ version: string }>(
    "SELECT version FROM aria_entries WHERE id = ? LIMIT 1",
    [record.entry.id],
  );
  if (input.expectedVersion) {
    if (!existing || String(existing.version) !== input.expectedVersion) {
      throw new Error(
        `Entry version conflict: expected ${input.expectedVersion}, found ${String(existing?.version ?? "missing")}`,
      );
    }
  } else if (existing) {
    throw new Error(`Entry already exists: ${record.entry.id}`);
  }

  const entry = entryToRow(record.entry);
  const createdBy = actorColumns(
    record.authorship?.createdBy ?? record.authorship?.author,
  );
  const updatedBy = actorColumns(
    record.authorship?.updatedBy ?? record.authorship?.author,
  );
  const publishedBy = actorColumns(record.authorship?.publishedBy);
  const lease = leaseGuard(input);
  const applied = appliedGuard(entry.id, entry.version);
  const statements: SqlStatement[] = [];

  if (input.expectedVersion) {
    statements.push({
      sql: `UPDATE aria_entries SET
        status = ?, version = ?, author_id = ?, updated_at = ?,
        published_at = ?, scheduled_for = ?, scheduled_version = ?,
        created_by_id = COALESCE(?, created_by_id),
        created_by_username = COALESCE(?, created_by_username),
        created_by_email = COALESCE(?, created_by_email),
        updated_by_id = ?, updated_by_username = ?, updated_by_email = ?,
        published_by_id = ?, published_by_username = ?, published_by_email = ?
      WHERE id = ? AND collection_id = ? AND version = ? AND ${lease.sql}`,
      args: [
        entry.status,
        entry.version,
        entry.author_id,
        entry.updated_at,
        entry.published_at,
        entry.scheduled_for,
        entry.scheduled_version,
        createdBy.id,
        createdBy.username,
        createdBy.email,
        updatedBy.id,
        updatedBy.username,
        updatedBy.email,
        publishedBy.id,
        publishedBy.username,
        publishedBy.email,
        entry.id,
        entry.collection_id,
        input.expectedVersion,
        ...lease.args,
      ],
    });
  } else {
    statements.push({
      sql: `INSERT INTO aria_entries (
        id, collection_id, status, version, author_id, created_at, updated_at,
        published_at, scheduled_for, scheduled_version, created_by_id, created_by_username,
        created_by_email, updated_by_id, updated_by_username, updated_by_email,
        published_by_id, published_by_username, published_by_email
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE ${lease.sql}`,
      args: [
        entry.id,
        entry.collection_id,
        entry.status,
        entry.version,
        entry.author_id,
        entry.created_at,
        entry.updated_at,
        entry.published_at,
        entry.scheduled_for,
        entry.scheduled_version,
        createdBy.id,
        createdBy.username,
        createdBy.email,
        updatedBy.id,
        updatedBy.username,
        updatedBy.email,
        publishedBy.id,
        publishedBy.username,
        publishedBy.email,
        ...lease.args,
      ],
    });
  }

  if (input.replaceLocales) {
    const locales = record.locales.map((locale) => locale.locale);
    statements.push({
      sql: `DELETE FROM aria_entry_locales
        WHERE entry_id = ?
          ${locales.length > 0 ? `AND locale NOT IN (${locales.map(() => "?").join(", ")})` : ""}
          AND ${applied.sql}`,
      args: [entry.id, ...locales, ...applied.args],
    });
  }
  for (const locale of record.locales) {
    const row = entryLocaleToRow({
      ...locale,
      entryId: entry.id,
      collectionId: entry.collection_id,
    });
    statements.push({
      sql: `INSERT INTO aria_entry_locales (
        entry_id, collection_id, locale, slug, title, frontmatter_json, body,
        is_source, translation_meta_json, comments_closed
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${applied.sql}
      ON CONFLICT(entry_id, locale) DO UPDATE SET
        collection_id = excluded.collection_id, slug = excluded.slug,
        title = excluded.title, frontmatter_json = excluded.frontmatter_json,
        body = excluded.body, is_source = excluded.is_source,
        translation_meta_json = excluded.translation_meta_json,
        comments_closed = excluded.comments_closed`,
      args: [
        row.entry_id,
        row.collection_id,
        row.locale,
        row.slug,
        row.title,
        row.frontmatter_json,
        row.body,
        row.is_source,
        row.translation_meta_json,
        row.comments_closed,
        ...applied.args,
      ],
    });
  }

  statements.push({
    sql: `UPDATE aria_cms_entry_workflow
      SET state = 'none', reviewed_version = NULL, updated_by_id = ?, updated_at = ?
      WHERE entry_id = ? AND state = 'approved' AND reviewed_version <> ?
        AND ${applied.sql}`,
    args: [
      entry.author_id,
      entry.updated_at,
      entry.id,
      entry.version,
      ...applied.args,
    ],
  });

  const relations = input.relations ?? record.relations;
  if (relations) {
    statements.push({
      sql: `DELETE FROM aria_entry_relations
        WHERE source_entry_id = ? AND ${applied.sql}`,
      args: [entry.id, ...applied.args],
    });
    for (const relation of relations) {
      const row = entryRelationToRow({ ...relation, sourceEntryId: entry.id });
      statements.push({
        sql: `INSERT INTO aria_entry_relations (
          source_entry_id, field_key, target_entry_id, position, meta_json
        ) SELECT ?, ?, ?, ?, ? WHERE ${applied.sql}`,
        args: [
          row.source_entry_id,
          row.field_key,
          row.target_entry_id,
          row.position,
          row.meta_json,
          ...applied.args,
        ],
      });
    }
  }

  const revision = input.revision;
  const revisionActor = actorColumns(revision.authorship?.actor);
  statements.push({
    sql: `INSERT INTO aria_entry_revisions (
      id, entry_id, locale, version, snapshot_json, actor_id, actor_username,
      actor_email, actor_avatar_url, message, created_at
    ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${applied.sql}`,
    args: [
      revision.id,
      revision.entryId,
      revision.locale,
      revision.version,
      JSON.stringify(revision.snapshot),
      revision.actorId,
      revisionActor.username,
      revisionActor.email,
      revisionActor.avatarUrl,
      revision.message ?? null,
      revision.createdAt,
      ...applied.args,
    ],
  });

  const audit = input.auditEvent;
  statements.push({
    sql: `INSERT INTO aria_cms_audit_events (
      id, action, actor_id, actor_username, collection_id, entry_id,
      summary, metadata_json, created_at
    ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${applied.sql}`,
    args: [
      audit.id,
      audit.action,
      audit.actorId,
      audit.actorUsername ?? null,
      audit.collectionId ?? null,
      audit.entryId ?? null,
      audit.summary,
      JSON.stringify(audit.metadata),
      audit.createdAt,
      ...applied.args,
    ],
  });

  if (input.integrationEvent) {
    statements.push(
      ...buildIntegrationEventStatements(input.integrationEvent, applied),
    );
  }

  if (input.api) {
    const api = input.api;
    const security = api.securityAudit;
    statements.push({
      sql: `INSERT INTO aria_api_security_audit (
        id, request_id, site_id, actor_id, credential_id, event_type, method,
        route_template, resource_type, resource_id, outcome, metadata_json,
        created_at, expires_at
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'entry', ?, ?, ?, ?, ?
        WHERE ${applied.sql}`,
      args: [
        security.id,
        security.requestId,
        security.siteId,
        security.actorId,
        security.credentialId,
        security.eventType,
        security.method,
        security.routeTemplate,
        entry.id,
        security.outcome,
        security.metadataJson,
        security.createdAt,
        security.expiresAt,
        ...applied.args,
      ],
    });
    statements.push({
      sql: `UPDATE aria_api_idempotency SET
        state = 'completed', response_status = ?, response_body_json = ?,
        response_headers_json = ?, resource_version = ?, updated_at = ?
      WHERE credential_id = ? AND idempotency_key = ?
        AND request_fingerprint = ? AND state = 'processing'
        AND lease_token = ? AND ${applied.sql}`,
      args: [
        api.response.status,
        JSON.stringify(api.response.body),
        JSON.stringify(api.response.headers),
        api.response.resourceVersion,
        api.committedAt,
        api.credentialId,
        api.key,
        api.fingerprint,
        api.leaseToken,
        ...applied.args,
      ],
    });
  }

  await runCmsBatch(executor, statements);
  const saved = await cmsGetEntry(executor, {
    collectionId: entry.collection_id,
    idOrSlug: entry.id,
    includeAllLocales: true,
    includeRelations: Boolean(relations),
  });
  if (!saved || saved.entry.version !== entry.version) {
    throw new Error(
      `Entry version conflict: expected committed version ${entry.version}`,
    );
  }
  return AriaEntryRecordSchema.parse(saved);
}
