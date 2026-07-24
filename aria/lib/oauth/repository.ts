import { z } from "zod";

import type { ApiSqlDatabase, ApiSqlRow } from "../api/database";
import { FigmaOAuthScopeSchema, type FigmaOAuthScope } from "./schemas";
import {
  FIGMA_OAUTH_CLIENT_ID,
  OAUTH_ACCESS_AUDIENCE,
  OAUTH_DEVICE_GRANT_TYPE,
  OAUTH_REFRESH_GRANT_TYPE,
} from "./config";

type DeviceRow = ApiSqlRow & {
  id: string;
  site_id: string;
  client_id: string;
  client_name: string;
  device_code_digest: string;
  device_code_key_id: string;
  requested_scopes_json: string;
  approved_scopes_json: string | null;
  principal_id: string | null;
  state: string;
  interval_seconds: number;
  next_poll_at: string;
  expires_at: string;
};

type RefreshTokenRow = ApiSqlRow & {
  id: string;
  family_id: string;
  generation: number;
  token_digest: string;
  key_id: string;
  expires_at: string;
  consumed_at: string | null;
  replaced_by_id: string | null;
  revoked_at: string | null;
  site_id: string;
  client_id: string;
  grant_id: string;
  principal_id: string;
  family_status: string;
  current_generation: number;
  absolute_expires_at: string;
  grant_status: string;
  scopes_json: string;
  client_status: string;
};

type AccessTokenRow = ApiSqlRow & {
  id: string;
  site_id: string;
  client_id: string;
  grant_id: string;
  principal_id: string;
  refresh_family_id: string | null;
  token_digest: string;
  key_id: string;
  audience: string;
  scopes_json: string;
  grant_scopes_json: string;
  client_allowed_scopes_json: string;
  expires_at: string;
  revoked_at: string | null;
  client_status: string;
  grant_status: string;
  family_status: string | null;
  family_absolute_expires_at: string | null;
  authority_consistent: number;
};

type GrantSummaryRow = ApiSqlRow & {
  id: string;
  client_id: string;
  client_name: string;
  principal_id: string;
  principal_username: string;
  principal_email: string;
  scopes_json: string;
  status: string;
  consented_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  active_sessions: number;
  session_expires_at: string | null;
};

const DeviceStateSchema = z.enum([
  "pending",
  "approved",
  "consumed",
  "denied",
  "expired",
]);

export type OAuthDeviceAuthorization = Readonly<{
  id: string;
  siteId: string;
  clientId: string;
  clientName: string;
  deviceCodeDigest: string;
  deviceCodeKeyId: string;
  requestedScopes: FigmaOAuthScope[];
  approvedScopes: FigmaOAuthScope[] | null;
  principalId: string | null;
  state: z.infer<typeof DeviceStateSchema>;
  intervalSeconds: number;
  nextPollAt: string;
  expiresAt: string;
}>;

export type OAuthRefreshTokenRecord = Readonly<{
  id: string;
  familyId: string;
  generation: number;
  tokenDigest: string;
  keyId: string;
  expiresAt: string;
  consumedAt: string | null;
  replacedById: string | null;
  revokedAt: string | null;
  siteId: string;
  clientId: string;
  grantId: string;
  principalId: string;
  familyStatus: "active" | "revoked";
  currentGeneration: number;
  absoluteExpiresAt: string;
  grantStatus: "active" | "revoked";
  scopes: FigmaOAuthScope[];
  clientStatus: "active" | "disabled" | "revoked";
}>;

export type OAuthAccessTokenRecord = Readonly<{
  id: string;
  siteId: string;
  clientId: string;
  grantId: string;
  principalId: string;
  refreshFamilyId: string | null;
  tokenDigest: string;
  keyId: string;
  audience: string;
  scopes: FigmaOAuthScope[];
  grantScopes: FigmaOAuthScope[];
  clientAllowedScopes: FigmaOAuthScope[];
  expiresAt: string;
  revokedAt: string | null;
  clientStatus: "active" | "disabled" | "revoked";
  grantStatus: "active" | "revoked";
  refreshFamilyStatus: "active" | "revoked" | null;
  refreshFamilyExpiresAt: string | null;
  authorityConsistent: boolean;
}>;

export type OAuthGrantSummary = Readonly<{
  id: string;
  clientId: string;
  clientName: string;
  principalId: string;
  principalUsername: string;
  principalEmail: string;
  scopes: FigmaOAuthScope[];
  status: "active" | "revoked";
  consentedAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  activeSessions: number;
  sessionExpiresAt: string | null;
}>;

const deviceColumns = `
  d.id, d.site_id, d.client_id, c.name AS client_name,
  d.device_code_digest, d.device_code_key_id, d.requested_scopes_json,
  d.approved_scopes_json, d.principal_id, d.state, d.interval_seconds,
  d.next_poll_at, d.expires_at
`;

function parseScopes(value: string): FigmaOAuthScope[] {
  return z.array(FigmaOAuthScopeSchema).parse(JSON.parse(value)).sort();
}

function parseDevice(row: DeviceRow): OAuthDeviceAuthorization {
  return {
    id: row.id,
    siteId: row.site_id,
    clientId: row.client_id,
    clientName: row.client_name,
    deviceCodeDigest: row.device_code_digest,
    deviceCodeKeyId: row.device_code_key_id,
    requestedScopes: parseScopes(row.requested_scopes_json),
    approvedScopes: row.approved_scopes_json
      ? parseScopes(row.approved_scopes_json)
      : null,
    principalId: row.principal_id,
    state: DeviceStateSchema.parse(row.state),
    intervalSeconds: Number(row.interval_seconds),
    nextPollAt: row.next_poll_at,
    expiresAt: row.expires_at,
  };
}

function parseRefreshToken(row: RefreshTokenRow): OAuthRefreshTokenRecord {
  return {
    id: row.id,
    familyId: row.family_id,
    generation: Number(row.generation),
    tokenDigest: row.token_digest,
    keyId: row.key_id,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    replacedById: row.replaced_by_id,
    revokedAt: row.revoked_at,
    siteId: row.site_id,
    clientId: row.client_id,
    grantId: row.grant_id,
    principalId: row.principal_id,
    familyStatus: z.enum(["active", "revoked"]).parse(row.family_status),
    currentGeneration: Number(row.current_generation),
    absoluteExpiresAt: row.absolute_expires_at,
    grantStatus: z.enum(["active", "revoked"]).parse(row.grant_status),
    scopes: parseScopes(row.scopes_json),
    clientStatus: z
      .enum(["active", "disabled", "revoked"])
      .parse(row.client_status),
  };
}

function parseAccessToken(row: AccessTokenRow): OAuthAccessTokenRecord {
  return {
    id: row.id,
    siteId: row.site_id,
    clientId: row.client_id,
    grantId: row.grant_id,
    principalId: row.principal_id,
    refreshFamilyId: row.refresh_family_id,
    tokenDigest: row.token_digest,
    keyId: row.key_id,
    audience: row.audience,
    scopes: parseScopes(row.scopes_json),
    grantScopes: parseScopes(row.grant_scopes_json),
    clientAllowedScopes: parseScopes(row.client_allowed_scopes_json),
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    clientStatus: z
      .enum(["active", "disabled", "revoked"])
      .parse(row.client_status),
    grantStatus: z.enum(["active", "revoked"]).parse(row.grant_status),
    refreshFamilyStatus:
      row.family_status === null
        ? null
        : z.enum(["active", "revoked"]).parse(row.family_status),
    refreshFamilyExpiresAt: row.family_absolute_expires_at,
    authorityConsistent: Number(row.authority_consistent) === 1,
  };
}

function parseGrantSummary(row: GrantSummaryRow): OAuthGrantSummary {
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: row.client_name,
    principalId: row.principal_id,
    principalUsername: row.principal_username,
    principalEmail: row.principal_email,
    scopes: parseScopes(row.scopes_json),
    status: z.enum(["active", "revoked"]).parse(row.status),
    consentedAt: row.consented_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
    revokeReason: row.revoke_reason,
    activeSessions: Number(row.active_sessions),
    sessionExpiresAt: row.session_expires_at,
  };
}

export class OAuthRepository {
  constructor(private readonly database: ApiSqlDatabase) {}

  async ensureBuiltInFigmaClient(
    siteId: string,
    now = new Date().toISOString(),
  ): Promise<void> {
    await this.database.execute(
      `INSERT INTO aria_oauth_clients (
        id, site_id, name, client_type, grant_types_json, redirect_uris_json,
        allowed_scopes_json, status, built_in_provider, created_by_id,
        created_at, updated_at, revoked_at
      ) VALUES (?, ?, 'Figma plugin', 'public', ?, '[]', ?, 'active',
                'figma', NULL, ?, ?, NULL)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        grant_types_json = excluded.grant_types_json,
        allowed_scopes_json = excluded.allowed_scopes_json,
        updated_at = excluded.updated_at
      WHERE aria_oauth_clients.site_id = excluded.site_id
        AND aria_oauth_clients.built_in_provider = 'figma'`,
      [
        FIGMA_OAUTH_CLIENT_ID,
        siteId,
        JSON.stringify([OAUTH_DEVICE_GRANT_TYPE, OAUTH_REFRESH_GRANT_TYPE]),
        JSON.stringify(FigmaOAuthScopeSchema.options),
        now,
        now,
      ],
    );
  }

  async isActiveClient(siteId: string, clientId: string): Promise<boolean> {
    const row = await this.database.queryFirst<{ id: string }>(
      `SELECT id FROM aria_oauth_clients
       WHERE id = ? AND site_id = ? AND client_type = 'public'
         AND status = 'active' LIMIT 1`,
      [clientId, siteId],
    );
    return Boolean(row);
  }

  async listGrantSummaries(
    siteId: string,
    now = new Date().toISOString(),
  ): Promise<OAuthGrantSummary[]> {
    const rows = await this.database.queryAll<GrantSummaryRow>(
      `SELECT g.id, g.client_id, c.name AS client_name,
              g.principal_id, u.username AS principal_username,
              u.email AS principal_email, g.scopes_json, g.status,
              g.consented_at, g.last_used_at, g.revoked_at, g.revoke_reason,
              SUM(CASE WHEN f.status = 'active' AND f.absolute_expires_at > ?
                       THEN 1 ELSE 0 END) AS active_sessions,
              MAX(CASE WHEN f.status = 'active' AND f.absolute_expires_at > ?
                       THEN f.absolute_expires_at ELSE NULL END)
                AS session_expires_at
       FROM aria_oauth_grants g
       JOIN aria_oauth_clients c ON c.id = g.client_id
       JOIN aria_users u ON u.id = g.principal_id
       LEFT JOIN aria_oauth_refresh_families f ON f.grant_id = g.id
       WHERE g.site_id = ?
       GROUP BY g.id, g.client_id, c.name, g.principal_id, u.username, u.email,
                g.scopes_json, g.status, g.consented_at, g.last_used_at,
                g.revoked_at, g.revoke_reason
       ORDER BY CASE g.status WHEN 'active' THEN 0 ELSE 1 END,
                COALESCE(g.last_used_at, g.consented_at) DESC, g.id`,
      [now, now, siteId],
    );
    return rows.map(parseGrantSummary);
  }

  async revokeGrant(input: {
    grantId: string;
    siteId: string;
    actorId: string;
    reason: string;
    now?: string;
  }): Promise<boolean> {
    const now = input.now ?? new Date().toISOString();
    const changes = await this.database.executeBatch([
      {
        sql: `UPDATE aria_oauth_grants
          SET status = 'revoked', revoked_at = ?, revoked_by_id = ?,
              revoke_reason = ?, updated_at = ?
          WHERE id = ? AND site_id = ? AND status = 'active'`,
        params: [
          now,
          input.actorId,
          input.reason,
          now,
          input.grantId,
          input.siteId,
        ],
      },
      {
        sql: `UPDATE aria_oauth_refresh_families
          SET status = 'revoked', revoked_at = COALESCE(revoked_at, ?),
              revoke_reason = COALESCE(revoke_reason, 'grant_revocation')
          WHERE grant_id = ? AND status = 'active'
            AND EXISTS (
              SELECT 1 FROM aria_oauth_grants
              WHERE id = ? AND site_id = ? AND status = 'revoked'
            )`,
        params: [now, input.grantId, input.grantId, input.siteId],
      },
      {
        sql: `UPDATE aria_oauth_refresh_tokens SET revoked_at = COALESCE(revoked_at, ?)
          WHERE family_id IN (
            SELECT id FROM aria_oauth_refresh_families WHERE grant_id = ?
          ) AND EXISTS (
            SELECT 1 FROM aria_oauth_grants
            WHERE id = ? AND site_id = ? AND status = 'revoked'
          )`,
        params: [now, input.grantId, input.grantId, input.siteId],
      },
      {
        sql: `UPDATE aria_oauth_access_tokens SET revoked_at = COALESCE(revoked_at, ?)
          WHERE grant_id = ? AND EXISTS (
            SELECT 1 FROM aria_oauth_grants
            WHERE id = ? AND site_id = ? AND status = 'revoked'
          )`,
        params: [now, input.grantId, input.grantId, input.siteId],
      },
      {
        sql: `UPDATE aria_oauth_device_authorizations
          SET state = 'expired', updated_at = ?,
              exchange_lease_token = NULL, exchange_lease_expires_at = NULL
          WHERE state = 'approved' AND EXISTS (
            SELECT 1 FROM aria_oauth_grants g
            WHERE g.id = ? AND g.site_id = ? AND g.status = 'revoked'
              AND g.client_id = aria_oauth_device_authorizations.client_id
              AND g.principal_id = aria_oauth_device_authorizations.principal_id
          )`,
        params: [now, input.grantId, input.siteId],
      },
      {
        sql: `INSERT INTO aria_integration_audit (
          id, site_id, request_id, event_type, actor_id, resource_type,
          resource_id, outcome, metadata_json, created_at, expires_at
        ) SELECT ?, g.site_id, NULL, 'oauth.grant.revoked', ?,
                 'oauth.grant', g.id, 'success', ?, ?, ?
          FROM aria_oauth_grants g
          WHERE g.id = ? AND g.site_id = ? AND g.revoked_at = ?
            AND NOT EXISTS (
              SELECT 1 FROM aria_integration_audit a
              WHERE a.event_type = 'oauth.grant.revoked'
                AND a.resource_type = 'oauth.grant'
                AND a.resource_id = g.id AND a.created_at = g.revoked_at
            )`,
        params: [
          crypto.randomUUID(),
          input.actorId,
          JSON.stringify({ reason: input.reason }),
          now,
          new Date(Date.parse(now) + 90 * 86_400_000).toISOString(),
          input.grantId,
          input.siteId,
          now,
        ],
      },
    ]);
    return changes[0] === 1;
  }

  async createDeviceAuthorization(input: {
    id: string;
    siteId: string;
    clientId: string;
    deviceCodePrefix: string;
    deviceCodeDigest: string;
    deviceCodeKeyId: string;
    userCodeDigest: string;
    userCodeKeyId: string;
    requestedScopes: readonly FigmaOAuthScope[];
    intervalSeconds: number;
    expiresAt: string;
    now: string;
  }): Promise<void> {
    await this.database.execute(
      `INSERT INTO aria_oauth_device_authorizations (
        id, site_id, client_id, device_code_prefix, device_code_digest,
        device_code_key_id, user_code_digest, user_code_key_id,
        requested_scopes_json, approved_scopes_json, principal_id, state,
        interval_seconds, next_poll_at, poll_violation_count,
        exchange_lease_token, exchange_lease_expires_at, expires_at,
        approved_at, consumed_at, denied_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'pending', ?, ?, 0,
                NULL, NULL, ?, NULL, NULL, NULL, ?, ?)`,
      [
        input.id,
        input.siteId,
        input.clientId,
        input.deviceCodePrefix,
        input.deviceCodeDigest,
        input.deviceCodeKeyId,
        input.userCodeDigest,
        input.userCodeKeyId,
        JSON.stringify([...input.requestedScopes].sort()),
        input.intervalSeconds,
        input.now,
        input.expiresAt,
        input.now,
        input.now,
      ],
    );
  }

  private async findDevice(
    where: string,
    params: readonly unknown[],
  ): Promise<OAuthDeviceAuthorization | null> {
    const row = await this.database.queryFirst<DeviceRow>(
      `SELECT ${deviceColumns}
       FROM aria_oauth_device_authorizations d
       JOIN aria_oauth_clients c ON c.id = d.client_id
       WHERE ${where} LIMIT 1`,
      params,
    );
    return row ? parseDevice(row) : null;
  }

  findDeviceByPrefix(prefix: string): Promise<OAuthDeviceAuthorization | null> {
    return this.findDevice("d.device_code_prefix = ?", [prefix]);
  }

  findDeviceByUserDigest(
    digest: string,
    keyId: string,
  ): Promise<OAuthDeviceAuthorization | null> {
    return this.findDevice(
      "d.user_code_digest = ? AND d.user_code_key_id = ?",
      [digest, keyId],
    );
  }

  async expireDevice(id: string, now: string): Promise<boolean> {
    return (
      (await this.database.execute(
        `UPDATE aria_oauth_device_authorizations
         SET state = 'expired', updated_at = ?
         WHERE id = ? AND state IN ('pending', 'approved') AND expires_at <= ?
           AND (exchange_lease_token IS NULL OR exchange_lease_expires_at <= ?)`,
        [now, id, now, now],
      )) > 0
    );
  }

  async approveDevice(input: {
    id: string;
    principalId: string;
    scopes: readonly FigmaOAuthScope[];
    now: string;
  }): Promise<boolean> {
    return (
      (await this.database.execute(
        `UPDATE aria_oauth_device_authorizations
         SET state = 'approved', principal_id = ?, approved_scopes_json = ?,
             approved_at = ?, updated_at = ?
         WHERE id = ? AND state = 'pending' AND expires_at > ?`,
        [
          input.principalId,
          JSON.stringify([...input.scopes].sort()),
          input.now,
          input.now,
          input.id,
          input.now,
        ],
      )) > 0
    );
  }

  async denyDevice(id: string, now: string): Promise<boolean> {
    return (
      (await this.database.execute(
        `UPDATE aria_oauth_device_authorizations
         SET state = 'denied', denied_at = ?, updated_at = ?
         WHERE id = ? AND state = 'pending' AND expires_at > ?`,
        [now, now, id, now],
      )) > 0
    );
  }

  async claimPoll(input: {
    id: string;
    now: string;
    nextPollAt: string;
  }): Promise<boolean> {
    return (
      (await this.database.execute(
        `UPDATE aria_oauth_device_authorizations SET next_poll_at = ?, updated_at = ?
         WHERE id = ? AND next_poll_at <= ? AND state IN ('pending', 'approved')`,
        [input.nextPollAt, input.now, input.id, input.now],
      )) > 0
    );
  }

  async slowDownPoll(input: {
    id: string;
    now: string;
    nextPollAt: string;
  }): Promise<void> {
    await this.database.execute(
      `UPDATE aria_oauth_device_authorizations
       SET next_poll_at = ?, poll_violation_count = poll_violation_count + 1,
           updated_at = ?
       WHERE id = ? AND state IN ('pending', 'approved')`,
      [input.nextPollAt, input.now, input.id],
    );
  }

  async claimApprovedExchange(input: {
    id: string;
    leaseToken: string;
    leaseExpiresAt: string;
    now: string;
  }): Promise<boolean> {
    return (
      (await this.database.execute(
        `UPDATE aria_oauth_device_authorizations
         SET exchange_lease_token = ?, exchange_lease_expires_at = ?, updated_at = ?
         WHERE id = ? AND state = 'approved' AND expires_at > ?
           AND (exchange_lease_token IS NULL OR exchange_lease_expires_at <= ?)`,
        [
          input.leaseToken,
          input.leaseExpiresAt,
          input.now,
          input.id,
          input.now,
          input.now,
        ],
      )) > 0
    );
  }

  async finalizeDeviceExchange(input: {
    deviceId: string;
    exchangeLeaseToken: string;
    siteId: string;
    clientId: string;
    proposedGrantId: string;
    principalId: string;
    scopes: readonly FigmaOAuthScope[];
    refreshFamilyId: string;
    refreshFamilyExpiresAt: string;
    refreshTokenId: string;
    refreshTokenPrefix: string;
    refreshTokenDigest: string;
    refreshTokenKeyId: string;
    accessTokenId: string;
    accessTokenPrefix: string;
    accessTokenDigest: string;
    accessTokenKeyId: string;
    accessTokenExpiresAt: string;
    now: string;
  }): Promise<void> {
    const scopesJson = JSON.stringify([...input.scopes].sort());
    const changes = await this.database.executeBatch([
      {
        sql: `INSERT INTO aria_oauth_grants (
          id, site_id, client_id, principal_id, scopes_json, status,
          consented_at, last_used_at, revoked_at, revoked_by_id, revoke_reason,
          created_at, updated_at
        ) SELECT ?, ?, ?, ?, ?, 'active', ?, NULL, NULL, NULL, NULL, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM aria_oauth_device_authorizations
            WHERE id = ? AND state = 'approved' AND exchange_lease_token = ?
          )
        ON CONFLICT(site_id, client_id, principal_id) DO UPDATE SET
          scopes_json = excluded.scopes_json, status = 'active',
          consented_at = excluded.consented_at, revoked_at = NULL,
          revoked_by_id = NULL, revoke_reason = NULL,
          updated_at = excluded.updated_at`,
        params: [
          input.proposedGrantId,
          input.siteId,
          input.clientId,
          input.principalId,
          scopesJson,
          input.now,
          input.now,
          input.now,
          input.deviceId,
          input.exchangeLeaseToken,
        ],
      },
      {
        sql: `UPDATE aria_oauth_refresh_families
          SET status = 'revoked', revoked_at = ?,
              revoke_reason = 'new_device_authorization'
          WHERE status = 'active' AND grant_id = (
            SELECT id FROM aria_oauth_grants
            WHERE site_id = ? AND client_id = ? AND principal_id = ?
          ) AND EXISTS (
            SELECT 1 FROM aria_oauth_device_authorizations
            WHERE id = ? AND state = 'approved' AND exchange_lease_token = ?
          )`,
        params: [
          input.now,
          input.siteId,
          input.clientId,
          input.principalId,
          input.deviceId,
          input.exchangeLeaseToken,
        ],
      },
      {
        sql: `UPDATE aria_oauth_refresh_tokens SET revoked_at = ?
          WHERE revoked_at IS NULL AND family_id IN (
            SELECT f.id FROM aria_oauth_refresh_families f
            JOIN aria_oauth_grants g ON g.id = f.grant_id
            WHERE g.site_id = ? AND g.client_id = ? AND g.principal_id = ?
              AND f.status = 'revoked' AND f.revoked_at = ?
          )`,
        params: [
          input.now,
          input.siteId,
          input.clientId,
          input.principalId,
          input.now,
        ],
      },
      {
        sql: `UPDATE aria_oauth_access_tokens SET revoked_at = ?
          WHERE revoked_at IS NULL AND grant_id = (
            SELECT id FROM aria_oauth_grants
            WHERE site_id = ? AND client_id = ? AND principal_id = ?
          ) AND EXISTS (
            SELECT 1 FROM aria_oauth_device_authorizations
            WHERE id = ? AND state = 'approved' AND exchange_lease_token = ?
          )`,
        params: [
          input.now,
          input.siteId,
          input.clientId,
          input.principalId,
          input.deviceId,
          input.exchangeLeaseToken,
        ],
      },
      {
        sql: `INSERT INTO aria_oauth_refresh_families (
          id, site_id, client_id, grant_id, principal_id, status,
          current_generation, absolute_expires_at, created_at, last_rotated_at,
          revoked_at, revoke_reason
        ) SELECT ?, ?, ?, g.id, ?, 'active', 1, ?, ?, ?, NULL, NULL
          FROM aria_oauth_grants g
          WHERE g.site_id = ? AND g.client_id = ? AND g.principal_id = ?
            AND g.status = 'active' AND EXISTS (
              SELECT 1 FROM aria_oauth_device_authorizations
              WHERE id = ? AND state = 'approved' AND exchange_lease_token = ?
            )`,
        params: [
          input.refreshFamilyId,
          input.siteId,
          input.clientId,
          input.principalId,
          input.refreshFamilyExpiresAt,
          input.now,
          input.now,
          input.siteId,
          input.clientId,
          input.principalId,
          input.deviceId,
          input.exchangeLeaseToken,
        ],
      },
      {
        sql: `INSERT INTO aria_oauth_refresh_tokens (
          id, family_id, generation, token_prefix, token_digest, key_id,
          issued_at, expires_at, consumed_at, replaced_by_id, revoked_at
        ) SELECT ?, ?, 1, ?, ?, ?, ?, ?, NULL, NULL, NULL
          WHERE EXISTS (
            SELECT 1 FROM aria_oauth_refresh_families
            WHERE id = ? AND status = 'active'
          )`,
        params: [
          input.refreshTokenId,
          input.refreshFamilyId,
          input.refreshTokenPrefix,
          input.refreshTokenDigest,
          input.refreshTokenKeyId,
          input.now,
          input.refreshFamilyExpiresAt,
          input.refreshFamilyId,
        ],
      },
      {
        sql: `INSERT INTO aria_oauth_access_tokens (
          id, site_id, client_id, grant_id, principal_id, refresh_family_id,
          token_prefix, token_digest, key_id, audience, scopes_json,
          expires_at, revoked_at, last_used_at, created_at
        ) SELECT ?, ?, ?, g.id, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?
          FROM aria_oauth_grants g
          WHERE g.site_id = ? AND g.client_id = ? AND g.principal_id = ?
            AND g.status = 'active' AND EXISTS (
              SELECT 1 FROM aria_oauth_refresh_tokens
              WHERE id = ? AND family_id = ?
            )`,
        params: [
          input.accessTokenId,
          input.siteId,
          input.clientId,
          input.principalId,
          input.refreshFamilyId,
          input.accessTokenPrefix,
          input.accessTokenDigest,
          input.accessTokenKeyId,
          OAUTH_ACCESS_AUDIENCE,
          scopesJson,
          input.accessTokenExpiresAt,
          input.now,
          input.siteId,
          input.clientId,
          input.principalId,
          input.refreshTokenId,
          input.refreshFamilyId,
        ],
      },
      {
        sql: `UPDATE aria_oauth_device_authorizations
          SET state = 'consumed', consumed_at = ?, updated_at = ?,
              exchange_lease_token = NULL, exchange_lease_expires_at = NULL
          WHERE id = ? AND state = 'approved' AND exchange_lease_token = ?
            AND EXISTS (
              SELECT 1 FROM aria_oauth_access_tokens
              WHERE id = ? AND refresh_family_id = ?
            )`,
        params: [
          input.now,
          input.now,
          input.deviceId,
          input.exchangeLeaseToken,
          input.accessTokenId,
          input.refreshFamilyId,
        ],
      },
      {
        sql: `INSERT INTO aria_integration_audit (
          id, site_id, event_type, actor_id, resource_type, resource_id,
          outcome, metadata_json, created_at, expires_at
        ) SELECT ?, f.site_id, 'oauth.device.exchanged', ?,
                 'oauth.refresh_family', f.id, 'success', ?, ?, ?
          FROM aria_oauth_refresh_families f
          WHERE f.id = ? AND EXISTS (
            SELECT 1 FROM aria_oauth_device_authorizations
            WHERE id = ? AND state = 'consumed' AND consumed_at = ?
          )`,
        params: [
          crypto.randomUUID(),
          input.principalId,
          JSON.stringify({ clientId: input.clientId }),
          input.now,
          new Date(Date.parse(input.now) + 90 * 86_400_000).toISOString(),
          input.refreshFamilyId,
          input.deviceId,
          input.now,
        ],
      },
    ]);
    if (
      changes[4] !== 1 ||
      changes[5] !== 1 ||
      changes[6] !== 1 ||
      changes[7] !== 1
    ) {
      throw new Error("OAUTH_DEVICE_EXCHANGE_LOST");
    }
  }

  async findRefreshTokenByPrefix(
    prefix: string,
  ): Promise<OAuthRefreshTokenRecord | null> {
    const row = await this.database.queryFirst<RefreshTokenRow>(
      `SELECT t.id, t.family_id, t.generation, t.token_digest, t.key_id,
              t.expires_at, t.consumed_at, t.replaced_by_id, t.revoked_at,
              f.site_id, f.client_id, f.grant_id, f.principal_id,
              f.status AS family_status, f.current_generation,
              f.absolute_expires_at, g.status AS grant_status, g.scopes_json,
              c.status AS client_status
       FROM aria_oauth_refresh_tokens t
       JOIN aria_oauth_refresh_families f ON f.id = t.family_id
       JOIN aria_oauth_grants g ON g.id = f.grant_id
       JOIN aria_oauth_clients c ON c.id = f.client_id
       WHERE t.token_prefix = ? LIMIT 1`,
      [prefix],
    );
    return row ? parseRefreshToken(row) : null;
  }

  async findAccessTokenByPrefix(
    prefix: string,
  ): Promise<OAuthAccessTokenRecord | null> {
    const row = await this.database.queryFirst<AccessTokenRow>(
      `SELECT t.id, t.site_id, t.client_id, t.grant_id, t.principal_id,
              t.refresh_family_id, t.token_digest, t.key_id, t.audience,
              t.scopes_json, g.scopes_json AS grant_scopes_json,
              c.allowed_scopes_json AS client_allowed_scopes_json,
              t.expires_at, t.revoked_at,
              c.status AS client_status, g.status AS grant_status,
              f.status AS family_status,
              f.absolute_expires_at AS family_absolute_expires_at,
              CASE WHEN c.site_id = t.site_id
                     AND g.site_id = t.site_id
                     AND g.client_id = t.client_id
                     AND g.principal_id = t.principal_id
                     AND (f.id IS NULL OR (
                       f.site_id = t.site_id
                       AND f.client_id = t.client_id
                       AND f.grant_id = t.grant_id
                       AND f.principal_id = t.principal_id
                     ))
                   THEN 1 ELSE 0 END AS authority_consistent
       FROM aria_oauth_access_tokens t
       JOIN aria_oauth_clients c ON c.id = t.client_id
       JOIN aria_oauth_grants g ON g.id = t.grant_id
       LEFT JOIN aria_oauth_refresh_families f ON f.id = t.refresh_family_id
       WHERE t.token_prefix = ? LIMIT 1`,
      [prefix],
    );
    return row ? parseAccessToken(row) : null;
  }

  async touchAccessToken(
    id: string,
    now = new Date().toISOString(),
  ): Promise<void> {
    const cutoff = new Date(Date.parse(now) - 5 * 60_000).toISOString();
    await this.database.executeBatch([
      {
        sql: `UPDATE aria_oauth_access_tokens SET last_used_at = ?
          WHERE id = ? AND (last_used_at IS NULL OR last_used_at <= ?)`,
        params: [now, id, cutoff],
      },
      {
        sql: `UPDATE aria_oauth_grants SET last_used_at = ?, updated_at = ?
          WHERE id = (
            SELECT grant_id FROM aria_oauth_access_tokens WHERE id = ?
          ) AND (last_used_at IS NULL OR last_used_at <= ?)`,
        params: [now, now, id, cutoff],
      },
    ]);
  }

  async appendResourceAudit(input: {
    requestId: string;
    siteId: string;
    method: string;
    outcome:
      | "invalid_token"
      | "missing_scope"
      | "principal_unavailable"
      | "capability_denied";
    actorId?: string;
    accessTokenId?: string;
    requiredScope?: FigmaOAuthScope;
    now?: string;
  }): Promise<void> {
    const now = input.now ?? new Date().toISOString();
    await this.database.execute(
      `INSERT INTO aria_integration_audit (
        id, site_id, request_id, event_type, actor_id, resource_type,
        resource_id, outcome, metadata_json, created_at, expires_at
      ) VALUES (?, ?, ?, 'oauth.resource.denied', ?, 'oauth.access_token',
                ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        input.siteId,
        input.requestId,
        input.actorId ?? null,
        input.accessTokenId ?? null,
        input.outcome,
        JSON.stringify({
          method: input.method,
          ...(input.requiredScope
            ? { requiredScope: input.requiredScope }
            : {}),
        }),
        now,
        new Date(Date.parse(now) + 90 * 86_400_000).toISOString(),
      ],
    );
  }

  async rotateRefreshToken(input: {
    tokenId: string;
    familyId: string;
    generation: number;
    newRefreshTokenId: string;
    newRefreshTokenPrefix: string;
    newRefreshTokenDigest: string;
    newRefreshTokenKeyId: string;
    newRefreshTokenExpiresAt: string;
    accessTokenId: string;
    accessTokenPrefix: string;
    accessTokenDigest: string;
    accessTokenKeyId: string;
    accessTokenExpiresAt: string;
    now: string;
  }): Promise<boolean> {
    const changes = await this.database.executeBatch([
      {
        sql: `INSERT INTO aria_oauth_refresh_tokens (
          id, family_id, generation, token_prefix, token_digest, key_id,
          issued_at, expires_at, consumed_at, replaced_by_id, revoked_at
        ) SELECT ?, t.family_id, t.generation + 1, ?, ?, ?, ?, ?, NULL, NULL, NULL
          FROM aria_oauth_refresh_tokens t
          JOIN aria_oauth_refresh_families f ON f.id = t.family_id
          JOIN aria_oauth_grants g ON g.id = f.grant_id
          JOIN aria_oauth_clients c ON c.id = f.client_id
          WHERE t.id = ? AND t.family_id = ? AND t.generation = ?
            AND t.consumed_at IS NULL AND t.revoked_at IS NULL
            AND t.expires_at > ? AND f.status = 'active'
            AND f.current_generation = t.generation
            AND f.absolute_expires_at > ? AND g.status = 'active'
            AND c.status = 'active'`,
        params: [
          input.newRefreshTokenId,
          input.newRefreshTokenPrefix,
          input.newRefreshTokenDigest,
          input.newRefreshTokenKeyId,
          input.now,
          input.newRefreshTokenExpiresAt,
          input.tokenId,
          input.familyId,
          input.generation,
          input.now,
          input.now,
        ],
      },
      {
        sql: `UPDATE aria_oauth_refresh_families
          SET current_generation = ?, last_rotated_at = ?
          WHERE id = ? AND status = 'active' AND current_generation = ?
            AND EXISTS (
              SELECT 1 FROM aria_oauth_refresh_tokens
              WHERE id = ? AND family_id = ?
            )`,
        params: [
          input.generation + 1,
          input.now,
          input.familyId,
          input.generation,
          input.newRefreshTokenId,
          input.familyId,
        ],
      },
      {
        sql: `UPDATE aria_oauth_refresh_tokens
          SET consumed_at = ?, replaced_by_id = ?
          WHERE id = ? AND family_id = ? AND consumed_at IS NULL
            AND revoked_at IS NULL AND EXISTS (
              SELECT 1 FROM aria_oauth_refresh_tokens WHERE id = ?
            )`,
        params: [
          input.now,
          input.newRefreshTokenId,
          input.tokenId,
          input.familyId,
          input.newRefreshTokenId,
        ],
      },
      {
        sql: `INSERT INTO aria_oauth_access_tokens (
          id, site_id, client_id, grant_id, principal_id, refresh_family_id,
          token_prefix, token_digest, key_id, audience, scopes_json,
          expires_at, revoked_at, last_used_at, created_at
        ) SELECT ?, f.site_id, f.client_id, f.grant_id, f.principal_id, f.id,
                 ?, ?, ?, ?, g.scopes_json, ?, NULL, NULL, ?
          FROM aria_oauth_refresh_families f
          JOIN aria_oauth_grants g ON g.id = f.grant_id
          WHERE f.id = ? AND f.status = 'active' AND g.status = 'active'
            AND EXISTS (
              SELECT 1 FROM aria_oauth_refresh_tokens
              WHERE id = ? AND family_id = f.id
            )`,
        params: [
          input.accessTokenId,
          input.accessTokenPrefix,
          input.accessTokenDigest,
          input.accessTokenKeyId,
          OAUTH_ACCESS_AUDIENCE,
          input.accessTokenExpiresAt,
          input.now,
          input.familyId,
          input.newRefreshTokenId,
        ],
      },
      {
        sql: `UPDATE aria_oauth_grants SET last_used_at = ?, updated_at = ?
          WHERE id = (
            SELECT grant_id FROM aria_oauth_refresh_families WHERE id = ?
          ) AND EXISTS (
            SELECT 1 FROM aria_oauth_refresh_tokens WHERE id = ?
          )`,
        params: [input.now, input.now, input.familyId, input.newRefreshTokenId],
      },
    ]);
    return changes.slice(0, 4).every((change) => change === 1);
  }

  async revokeRefreshFamily(input: {
    familyId: string;
    reason: "refresh_reuse" | "token_revocation";
    now: string;
  }): Promise<boolean> {
    const changes = await this.database.executeBatch([
      {
        sql: `UPDATE aria_oauth_refresh_families
          SET status = 'revoked', revoked_at = ?, revoke_reason = ?
          WHERE id = ? AND status = 'active'`,
        params: [input.now, input.reason, input.familyId],
      },
      {
        sql: `UPDATE aria_oauth_refresh_tokens SET revoked_at = ?
          WHERE family_id = ? AND revoked_at IS NULL`,
        params: [input.now, input.familyId],
      },
      {
        sql: `UPDATE aria_oauth_access_tokens SET revoked_at = ?
          WHERE refresh_family_id = ? AND revoked_at IS NULL`,
        params: [input.now, input.familyId],
      },
      {
        sql: `INSERT INTO aria_integration_audit (
          id, site_id, event_type, actor_id, resource_type, resource_id,
          outcome, metadata_json, created_at, expires_at
        ) SELECT ?, site_id, ?, principal_id, 'oauth.refresh_family', id,
                 'success', ?, ?, ?
          FROM aria_oauth_refresh_families WHERE id = ?`,
        params: [
          crypto.randomUUID(),
          input.reason === "refresh_reuse"
            ? "oauth.refresh.reuse_detected"
            : "oauth.token.revoked",
          JSON.stringify({ reason: input.reason }),
          input.now,
          new Date(Date.parse(input.now) + 90 * 86_400_000).toISOString(),
          input.familyId,
        ],
      },
    ]);
    return changes[0] === 1;
  }

  async revokeAccessToken(id: string, now: string): Promise<boolean> {
    const changes = await this.database.executeBatch([
      {
        sql: `UPDATE aria_oauth_access_tokens SET revoked_at = ?
          WHERE id = ? AND revoked_at IS NULL`,
        params: [now, id],
      },
      {
        sql: `INSERT INTO aria_integration_audit (
          id, site_id, event_type, actor_id, resource_type, resource_id,
          outcome, metadata_json, created_at, expires_at
        ) SELECT ?, site_id, 'oauth.token.revoked', principal_id,
                 'oauth.access_token', id, 'success', ?, ?, ?
          FROM aria_oauth_access_tokens WHERE id = ? AND revoked_at = ?`,
        params: [
          crypto.randomUUID(),
          JSON.stringify({ reason: "token_revocation" }),
          now,
          new Date(Date.parse(now) + 90 * 86_400_000).toISOString(),
          id,
          now,
        ],
      },
    ]);
    return changes[0] === 1;
  }
}
