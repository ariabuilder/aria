import { z } from "zod";
import type { ApiSqlDatabase, ApiSqlRow } from "./database";
import {
  ApiCredentialSchema,
  ApiScopeSchema,
  SITE_API_AUDIENCE,
  type ApiCredential,
  type ApiCredentialKind,
  type ApiScope,
} from "./schemas";
import type { StoredApiResponse } from "./mutationContext";

type CredentialRow = ApiSqlRow & {
  id: string;
  site_id: string;
  kind: string;
  principal_id: string;
  created_by_id: string | null;
  audience: string;
  name: string;
  token_prefix: string;
  token_digest: string;
  key_id: string;
  scopes_json: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

const credentialColumns = `
  id, site_id, kind, principal_id, created_by_id, audience, name,
  token_prefix, token_digest, key_id, scopes_json, expires_at, revoked_at,
  last_used_at, created_at, updated_at
`;

function parseCredential(row: CredentialRow): ApiCredential {
  return ApiCredentialSchema.parse({
    id: row.id,
    siteId: row.site_id,
    kind: row.kind,
    principalId: row.principal_id,
    createdById: row.created_by_id,
    audience: row.audience,
    name: row.name,
    tokenPrefix: row.token_prefix,
    tokenDigest: row.token_digest,
    keyId: row.key_id,
    scopes: z.array(ApiScopeSchema).parse(JSON.parse(row.scopes_json)),
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export type { StoredApiResponse } from "./mutationContext";

export type IdempotencyClaim =
  | { kind: "claimed"; leaseToken: string; leaseExpiresAt: string }
  | { kind: "conflict" }
  | { kind: "processing" }
  | { kind: "replay"; response: StoredApiResponse };

export class ApiRepository {
  constructor(private readonly database: ApiSqlDatabase) {}

  async getOrCreateSiteIdentity(
    proposedId = crypto.randomUUID(),
    now = new Date().toISOString(),
  ): Promise<string> {
    await this.database.execute(
      `INSERT OR IGNORE INTO aria_site_identity (singleton_id, site_id, created_at) VALUES (1, ?, ?)`,
      [proposedId, now],
    );
    const row = await this.database.queryFirst<{ site_id: string }>(
      `SELECT site_id FROM aria_site_identity WHERE singleton_id = 1`,
    );
    return z.uuid().parse(row?.site_id);
  }

  async insertCredential(input: {
    id: string;
    siteId: string;
    kind: ApiCredentialKind;
    principalId: string;
    createdById: string;
    name: string;
    tokenPrefix: string;
    tokenDigest: string;
    keyId: string;
    scopes: readonly ApiScope[];
    expiresAt: string | null;
    now?: string;
  }): Promise<ApiCredential> {
    const now = input.now ?? new Date().toISOString();
    await this.database.execute(
      `INSERT INTO aria_api_credentials (
        id, site_id, kind, principal_id, created_by_id, audience, name,
        token_prefix, token_digest, key_id, scopes_json, expires_at,
        revoked_at, last_used_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
      [
        input.id,
        input.siteId,
        input.kind,
        input.principalId,
        input.createdById,
        SITE_API_AUDIENCE,
        input.name,
        input.tokenPrefix,
        input.tokenDigest,
        input.keyId,
        JSON.stringify([...input.scopes].sort()),
        input.expiresAt,
        now,
        now,
      ],
    );
    const created = await this.getCredentialById(input.id);
    if (!created) throw new Error("API_CREDENTIAL_CREATE_FAILED");
    return created;
  }

  async insertCredentialWithAudit(input: {
    id: string;
    siteId: string;
    kind: ApiCredentialKind;
    principalId: string;
    createdById: string;
    name: string;
    tokenPrefix: string;
    tokenDigest: string;
    keyId: string;
    scopes: readonly ApiScope[];
    expiresAt: string | null;
    requestId: string;
    now?: string;
  }): Promise<ApiCredential> {
    const now = input.now ?? new Date().toISOString();
    const auditExpiresAt = new Date(
      Date.parse(now) + 90 * 24 * 60 * 60 * 1_000,
    ).toISOString();
    await this.database.executeBatch([
      {
        sql: `INSERT INTO aria_api_credentials (
          id, site_id, kind, principal_id, created_by_id, audience, name,
          token_prefix, token_digest, key_id, scopes_json, expires_at,
          revoked_at, last_used_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
        params: [
          input.id,
          input.siteId,
          input.kind,
          input.principalId,
          input.createdById,
          SITE_API_AUDIENCE,
          input.name,
          input.tokenPrefix,
          input.tokenDigest,
          input.keyId,
          JSON.stringify([...input.scopes].sort()),
          input.expiresAt,
          now,
          now,
        ],
      },
      {
        sql: `INSERT INTO aria_api_security_audit (
          id, request_id, site_id, actor_id, credential_id, event_type,
          outcome, metadata_json, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, 'credential.created', 'success', ?, ?, ?)`,
        params: [
          crypto.randomUUID(),
          input.requestId,
          input.siteId,
          input.createdById,
          input.id,
          JSON.stringify({
            kind: input.kind,
            scopes: [...input.scopes].sort(),
          }),
          now,
          auditExpiresAt,
        ],
      },
    ]);
    const created = await this.getCredentialById(input.id);
    if (!created) throw new Error("API_CREDENTIAL_CREATE_FAILED");
    return created;
  }

  async getCredentialById(id: string): Promise<ApiCredential | null> {
    const row = await this.database.queryFirst<CredentialRow>(
      `SELECT ${credentialColumns} FROM aria_api_credentials WHERE id = ? LIMIT 1`,
      [id],
    );
    return row ? parseCredential(row) : null;
  }

  async getCredentialByPrefix(prefix: string): Promise<ApiCredential | null> {
    const row = await this.database.queryFirst<CredentialRow>(
      `SELECT ${credentialColumns} FROM aria_api_credentials WHERE token_prefix = ? LIMIT 1`,
      [prefix],
    );
    return row ? parseCredential(row) : null;
  }

  async listCredentialsForPrincipal(
    principalId: string,
  ): Promise<ApiCredential[]> {
    const rows = await this.database.queryAll<CredentialRow>(
      `SELECT ${credentialColumns} FROM aria_api_credentials
       WHERE principal_id = ? ORDER BY created_at DESC`,
      [principalId],
    );
    return rows.map(parseCredential);
  }

  async listPersonalCredentialsForPrincipal(
    principalId: string,
  ): Promise<ApiCredential[]> {
    const rows = await this.database.queryAll<CredentialRow>(
      `SELECT ${credentialColumns} FROM aria_api_credentials
       WHERE principal_id = ? AND kind = 'personal'
       ORDER BY created_at DESC`,
      [principalId],
    );
    return rows.map(parseCredential);
  }

  async listAllCredentials(): Promise<ApiCredential[]> {
    return (
      await this.database.queryAll<CredentialRow>(
        `SELECT ${credentialColumns} FROM aria_api_credentials ORDER BY created_at DESC`,
      )
    ).map(parseCredential);
  }

  async revokeCredential(
    id: string,
    now = new Date().toISOString(),
  ): Promise<boolean> {
    return (
      (await this.database.execute(
        `UPDATE aria_api_credentials SET revoked_at = ?, updated_at = ?
         WHERE id = ? AND revoked_at IS NULL`,
        [now, now, id],
      )) > 0
    );
  }

  async revokeCredentialWithAudit(input: {
    credential: ApiCredential;
    actorId: string;
    requestId: string;
    now?: string;
  }): Promise<boolean> {
    const now = input.now ?? new Date().toISOString();
    const auditExpiresAt = new Date(
      Date.parse(now) + 90 * 24 * 60 * 60 * 1_000,
    ).toISOString();
    const results = await this.database.executeBatch([
      {
        sql: `UPDATE aria_api_credentials SET revoked_at = ?, updated_at = ?
              WHERE id = ? AND revoked_at IS NULL`,
        params: [now, now, input.credential.id],
      },
      {
        sql: `INSERT INTO aria_api_security_audit (
          id, request_id, site_id, actor_id, credential_id, event_type,
          outcome, metadata_json, created_at, expires_at
        )
        SELECT ?, ?, ?, ?, id, 'credential.revoked', 'success', '{}', ?, ?
        FROM aria_api_credentials
        WHERE id = ? AND revoked_at = ? AND changes() > 0`,
        params: [
          crypto.randomUUID(),
          input.requestId,
          input.credential.siteId,
          input.actorId,
          now,
          auditExpiresAt,
          input.credential.id,
          now,
        ],
      },
    ]);
    return (results[0] ?? 0) > 0;
  }

  /**
   * Removes a credential only after it has been revoked. The audit trail is
   * intentionally retained, but no longer points at the removed record.
   */
  async removeRevokedCredentialWithAudit(input: {
    credential: ApiCredential;
    actorId: string;
    requestId: string;
    now?: string;
  }): Promise<boolean> {
    const now = input.now ?? new Date().toISOString();
    const auditExpiresAt = new Date(
      Date.parse(now) + 90 * 24 * 60 * 60 * 1_000,
    ).toISOString();
    const results = await this.database.executeBatch([
      {
        sql: `DELETE FROM aria_api_credentials
              WHERE id = ? AND revoked_at IS NOT NULL`,
        params: [input.credential.id],
      },
      {
        sql: `INSERT INTO aria_api_security_audit (
          id, request_id, site_id, actor_id, credential_id, event_type,
          outcome, metadata_json, created_at, expires_at
        )
        SELECT ?, ?, ?, ?, NULL, 'credential.removed', 'success', ?, ?, ?
        WHERE changes() > 0`,
        params: [
          crypto.randomUUID(),
          input.requestId,
          input.credential.siteId,
          input.actorId,
          JSON.stringify({
            credentialId: input.credential.id,
            kind: input.credential.kind,
            name: input.credential.name,
          }),
          now,
          auditExpiresAt,
        ],
      },
    ]);
    return (results[0] ?? 0) > 0;
  }

  async touchCredential(
    id: string,
    now = new Date().toISOString(),
  ): Promise<void> {
    const cutoff = new Date(Date.parse(now) - 5 * 60_000).toISOString();
    await this.database.execute(
      `UPDATE aria_api_credentials SET last_used_at = ?, updated_at = ?
       WHERE id = ? AND (last_used_at IS NULL OR last_used_at <= ?)`,
      [now, now, id, cutoff],
    );
  }

  async claimIdempotency(input: {
    credentialId: string;
    key: string;
    method: string;
    routeTemplate: string;
    fingerprint: string;
    now?: string;
    expiresAt: string;
    leaseDurationMs?: number;
  }): Promise<IdempotencyClaim> {
    const now = input.now ?? new Date().toISOString();
    const leaseToken = crypto.randomUUID();
    const leaseExpiresAt = new Date(
      Date.parse(now) + (input.leaseDurationMs ?? 5 * 60_000),
    ).toISOString();
    await this.database.execute(
      `DELETE FROM aria_api_idempotency WHERE expires_at <= ?`,
      [now],
    );
    const inserted = await this.database.execute(
      `INSERT OR IGNORE INTO aria_api_idempotency (
        id, credential_id, idempotency_key, method, route_template,
        request_fingerprint, state, lease_token, lease_expires_at,
        created_at, updated_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'processing', ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        input.credentialId,
        input.key,
        input.method,
        input.routeTemplate,
        input.fingerprint,
        leaseToken,
        leaseExpiresAt,
        now,
        now,
        input.expiresAt,
      ],
    );
    if (inserted > 0) {
      return { kind: "claimed", leaseToken, leaseExpiresAt };
    }
    const row = await this.database.queryFirst<{
      request_fingerprint: string;
      state: string;
      lease_expires_at: string | null;
      response_status: number | null;
      response_body_json: string | null;
      response_headers_json: string | null;
      resource_version: string | null;
    }>(
      `SELECT request_fingerprint, state, lease_expires_at, response_status,
              response_body_json, response_headers_json, resource_version
       FROM aria_api_idempotency
       WHERE credential_id = ? AND idempotency_key = ? LIMIT 1`,
      [input.credentialId, input.key],
    );
    if (!row || row.request_fingerprint !== input.fingerprint) {
      return { kind: "conflict" };
    }
    if (row.state !== "completed") {
      if (row.lease_expires_at === null || row.lease_expires_at <= now) {
        const reclaimed = await this.database.execute(
          `UPDATE aria_api_idempotency
           SET lease_token = ?, lease_expires_at = ?, updated_at = ?
           WHERE credential_id = ? AND idempotency_key = ?
             AND request_fingerprint = ? AND state = 'processing'
             AND (lease_expires_at IS NULL OR lease_expires_at <= ?)`,
          [
            leaseToken,
            leaseExpiresAt,
            now,
            input.credentialId,
            input.key,
            input.fingerprint,
            now,
          ],
        );
        if (reclaimed > 0) {
          return { kind: "claimed", leaseToken, leaseExpiresAt };
        }
      }
      return { kind: "processing" };
    }
    if (row.response_status === null || row.response_body_json === null) {
      return { kind: "processing" };
    }
    return {
      kind: "replay",
      response: {
        status: row.response_status,
        body: JSON.parse(row.response_body_json),
        headers: row.response_headers_json
          ? (JSON.parse(row.response_headers_json) as Record<string, string>)
          : {},
        resourceVersion: row.resource_version,
      },
    };
  }

  async completeIdempotency(input: {
    credentialId: string;
    key: string;
    fingerprint: string;
    leaseToken: string;
    response: StoredApiResponse;
    now?: string;
  }): Promise<void> {
    const now = input.now ?? new Date().toISOString();
    await this.database.execute(
      `UPDATE aria_api_idempotency
       SET state = 'completed', response_status = ?, response_body_json = ?,
           response_headers_json = ?, resource_version = ?, updated_at = ?
       WHERE credential_id = ? AND idempotency_key = ?
         AND request_fingerprint = ? AND state = 'processing'
         AND lease_token = ?`,
      [
        input.response.status,
        JSON.stringify(input.response.body),
        JSON.stringify(input.response.headers),
        input.response.resourceVersion,
        now,
        input.credentialId,
        input.key,
        input.fingerprint,
        input.leaseToken,
      ],
    );
  }

  async abandonIdempotency(input: {
    credentialId: string;
    key: string;
    fingerprint: string;
    leaseToken: string;
  }): Promise<void> {
    await this.database.execute(
      `DELETE FROM aria_api_idempotency
       WHERE credential_id = ? AND idempotency_key = ?
         AND request_fingerprint = ? AND state = 'processing'
         AND lease_token = ?`,
      [input.credentialId, input.key, input.fingerprint, input.leaseToken],
    );
  }

  async appendSecurityAudit(input: {
    requestId: string;
    siteId?: string | null;
    actorId?: string | null;
    credentialId?: string | null;
    eventType: string;
    method?: string | null;
    routeTemplate?: string | null;
    resourceType?: string | null;
    resourceId?: string | null;
    outcome: string;
    metadata?: Record<string, unknown>;
    now?: string;
  }): Promise<void> {
    const now = input.now ?? new Date().toISOString();
    const expiresAt = new Date(
      Date.parse(now) + 90 * 24 * 60 * 60 * 1_000,
    ).toISOString();
    await this.database.execute(
      `DELETE FROM aria_api_security_audit WHERE expires_at <= ?`,
      [now],
    );
    await this.database.execute(
      `INSERT INTO aria_api_security_audit (
        id, request_id, site_id, actor_id, credential_id, event_type, method,
        route_template, resource_type, resource_id, outcome, metadata_json,
        created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        input.requestId,
        input.siteId ?? null,
        input.actorId ?? null,
        input.credentialId ?? null,
        input.eventType,
        input.method ?? null,
        input.routeTemplate ?? null,
        input.resourceType ?? null,
        input.resourceId ?? null,
        input.outcome,
        JSON.stringify(input.metadata ?? {}),
        now,
        expiresAt,
      ],
    );
  }
}
