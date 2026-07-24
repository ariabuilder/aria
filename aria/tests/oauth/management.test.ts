import { createClient, type Client } from "@libsql/client";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LibSqlApiSqlDatabase } from "../../lib/api/database";
import { ApiRepository } from "../../lib/api/repository";
import { FIGMA_OAUTH_CLIENT_ID } from "../../lib/oauth/config";
import { runOAuthMaintenance } from "../../lib/oauth/maintenance";
import { OAuthRepository } from "../../lib/oauth/repository";
import type { FigmaOAuthScope } from "../../lib/oauth/schemas";

const userId = "10000000-0000-4000-8000-000000000001";
const secondUserId = "10000000-0000-4000-8000-000000000002";

describe("OAuth grant management and retention", () => {
  let client: Client;
  let database: LibSqlApiSqlDatabase;
  let repository: OAuthRepository;
  let siteId: string;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    for (const migration of [
      "0001_baseline_schema.sql",
      "0002_api_foundation.sql",
      "0003_api_idempotency_leases.sql",
      "0004_api_lifecycle_hardening.sql",
      "0005_integration_events.sql",
      "0006_webhook_delivery.sql",
      "0007_oauth_provider.sql",
    ]) {
      await client.executeMultiple(
        await readFile(
          resolve(process.cwd(), `aria/migrations/${migration}`),
          "utf8",
        ),
      );
    }
    await client.execute({
      sql: `INSERT INTO aria_users (
        id, username, email, password_hash, role, created_at
      ) VALUES (?, 'oauth-user', 'oauth@example.test', 'unused',
                'administrator', '2025-01-01T00:00:00.000Z')`,
      args: [userId],
    });
    await client.execute({
      sql: `INSERT INTO aria_users (
        id, username, email, password_hash, role, created_at
      ) VALUES (?, 'oauth-user-2', 'oauth-2@example.test', 'unused',
                'administrator', '2025-01-01T00:00:00.000Z')`,
      args: [secondUserId],
    });
    database = new LibSqlApiSqlDatabase(client);
    repository = new OAuthRepository(database);
    siteId = await new ApiRepository(database).getOrCreateSiteIdentity(
      "20000000-0000-4000-8000-000000000001",
    );
    await repository.ensureBuiltInFigmaClient(siteId);
  });

  afterEach(() => client.close());

  async function seedFamily(input: {
    suffix: string;
    scopes?: readonly FigmaOAuthScope[];
    grantStatus?: "active" | "revoked";
    familyStatus?: "active" | "revoked";
    principalId?: string;
    timestamp?: string;
    absoluteExpiresAt?: string;
    accessExpiresAt?: string;
  }) {
    const grantId = `grant-${input.suffix}`;
    const familyId = `family-${input.suffix}`;
    const accessId = `access-${input.suffix}`;
    const refreshId = `refresh-${input.suffix}`;
    const timestamp = input.timestamp ?? "2026-07-20T12:00:00.000Z";
    const grantStatus = input.grantStatus ?? "active";
    const familyStatus = input.familyStatus ?? "active";
    const scopes = input.scopes ?? ["figma:context:read"];
    const principalId = input.principalId ?? userId;
    await client.batch(
      [
        {
          sql: `INSERT INTO aria_oauth_grants (
            id, site_id, client_id, principal_id, scopes_json, status,
            consented_at, revoked_at, revoked_by_id, revoke_reason,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            grantId,
            siteId,
            FIGMA_OAUTH_CLIENT_ID,
            principalId,
            JSON.stringify(scopes),
            grantStatus,
            timestamp,
            grantStatus === "revoked" ? timestamp : null,
            grantStatus === "revoked" ? userId : null,
            grantStatus === "revoked" ? "test" : null,
            timestamp,
            timestamp,
          ],
        },
        {
          sql: `INSERT INTO aria_oauth_refresh_families (
            id, site_id, client_id, grant_id, principal_id, status,
            current_generation, absolute_expires_at, created_at,
            last_rotated_at, revoked_at, revoke_reason
          ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
          args: [
            familyId,
            siteId,
            FIGMA_OAUTH_CLIENT_ID,
            grantId,
            principalId,
            familyStatus,
            input.absoluteExpiresAt ?? "2026-08-20T12:00:00.000Z",
            timestamp,
            timestamp,
            familyStatus === "revoked" ? timestamp : null,
            familyStatus === "revoked" ? "test" : null,
          ],
        },
        {
          sql: `INSERT INTO aria_oauth_refresh_tokens (
            id, family_id, generation, token_prefix, token_digest, key_id,
            issued_at, expires_at, consumed_at, replaced_by_id, revoked_at
          ) VALUES (?, ?, 1, ?, ?, 'v1', ?, ?, NULL, NULL, ?)`,
          args: [
            refreshId,
            familyId,
            `refresh-prefix-${input.suffix}`,
            `refresh-digest-${input.suffix}`,
            timestamp,
            input.absoluteExpiresAt ?? "2026-08-20T12:00:00.000Z",
            familyStatus === "revoked" ? timestamp : null,
          ],
        },
        {
          sql: `INSERT INTO aria_oauth_access_tokens (
            id, site_id, client_id, grant_id, principal_id,
            refresh_family_id, token_prefix, token_digest, key_id, audience,
            scopes_json, expires_at, revoked_at, last_used_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'v1', 'aria-figma-api', ?, ?, ?,
                    NULL, ?)`,
          args: [
            accessId,
            siteId,
            FIGMA_OAUTH_CLIENT_ID,
            grantId,
            principalId,
            familyId,
            `access-prefix-${input.suffix}`,
            `access-digest-${input.suffix}`,
            JSON.stringify(scopes),
            input.accessExpiresAt ?? "2026-07-20T12:15:00.000Z",
            familyStatus === "revoked" ? timestamp : null,
            timestamp,
          ],
        },
      ],
      "write",
    );
    return { accessId, familyId, grantId, refreshId };
  }

  it("lists safe grant summaries without token material", async () => {
    const seeded = await seedFamily({
      suffix: "summary",
      scopes: ["figma:context:read", "figma:imports:write"],
    });
    const summaries = await repository.listGrantSummaries(
      siteId,
      "2026-07-20T12:01:00.000Z",
    );

    expect(summaries).toEqual([
      expect.objectContaining({
        id: seeded.grantId,
        clientId: FIGMA_OAUTH_CLIENT_ID,
        clientName: "Figma plugin",
        principalUsername: "oauth-user",
        scopes: ["figma:context:read", "figma:imports:write"],
        status: "active",
        activeSessions: 1,
      }),
    ]);
    expect(JSON.stringify(summaries)).not.toContain("digest");
    expect(JSON.stringify(summaries)).not.toContain("prefix");
  });

  it("revokes a grant, every token session, and an approved exchange", async () => {
    const seeded = await seedFamily({ suffix: "revoke" });
    await client.execute({
      sql: `INSERT INTO aria_oauth_device_authorizations (
        id, site_id, client_id, device_code_prefix, device_code_digest,
        device_code_key_id, user_code_digest, user_code_key_id,
        requested_scopes_json, approved_scopes_json, principal_id, state,
        interval_seconds, next_poll_at, poll_violation_count, expires_at,
        approved_at, created_at, updated_at
      ) VALUES ('device-revoke', ?, ?, 'device-prefix-revoke',
                'device-digest-revoke', 'v1', 'user-digest-revoke', 'v1',
                '["figma:context:read"]', '["figma:context:read"]', ?,
                'approved', 5, '2026-07-20T12:00:00.000Z', 0,
                '2026-07-20T12:10:00.000Z', '2026-07-20T12:00:00.000Z',
                '2026-07-20T12:00:00.000Z', '2026-07-20T12:00:00.000Z')`,
      args: [siteId, FIGMA_OAUTH_CLIENT_ID, userId],
    });

    await expect(
      repository.revokeGrant({
        grantId: seeded.grantId,
        siteId,
        actorId: userId,
        reason: "Disconnected in Studio",
        now: "2026-07-20T12:02:00.000Z",
      }),
    ).resolves.toBe(true);
    await expect(
      repository.revokeGrant({
        grantId: seeded.grantId,
        siteId,
        actorId: userId,
        reason: "Repeated",
        now: "2026-07-20T12:02:01.000Z",
      }),
    ).resolves.toBe(false);

    const state = await client.execute({
      sql: `SELECT
        (SELECT status FROM aria_oauth_grants WHERE id = ?) AS grant_status,
        (SELECT status FROM aria_oauth_refresh_families WHERE id = ?)
          AS family_status,
        (SELECT revoked_at FROM aria_oauth_refresh_tokens WHERE id = ?)
          AS refresh_revoked_at,
        (SELECT revoked_at FROM aria_oauth_access_tokens WHERE id = ?)
          AS access_revoked_at,
        (SELECT state FROM aria_oauth_device_authorizations
         WHERE id = 'device-revoke') AS device_state,
        (SELECT COUNT(*) FROM aria_integration_audit
         WHERE event_type = 'oauth.grant.revoked' AND resource_id = ?) AS audits`,
      args: [
        seeded.grantId,
        seeded.familyId,
        seeded.refreshId,
        seeded.accessId,
        seeded.grantId,
      ],
    });
    expect(state.rows[0]).toMatchObject({
      grant_status: "revoked",
      family_status: "revoked",
      device_state: "expired",
      audits: 1,
    });
    expect(state.rows[0]?.refresh_revoked_at).not.toBeNull();
    expect(state.rows[0]?.access_revoked_at).not.toBeNull();
  });

  it("expires live state and purges only records beyond bounded retention", async () => {
    const old = await seedFamily({
      suffix: "old",
      grantStatus: "revoked",
      familyStatus: "revoked",
      timestamp: "2025-01-01T00:00:00.000Z",
      absoluteExpiresAt: "2025-01-01T00:00:00.000Z",
      accessExpiresAt: "2025-01-01T00:00:00.000Z",
    });
    const expiring = await seedFamily({
      suffix: "expiring",
      principalId: secondUserId,
      absoluteExpiresAt: "2026-07-19T00:00:00.000Z",
      accessExpiresAt: "2026-07-21T00:00:00.000Z",
    });
    await client.batch(
      [
        {
          sql: `INSERT INTO aria_oauth_device_authorizations (
            id, site_id, client_id, device_code_prefix, device_code_digest,
            device_code_key_id, user_code_digest, user_code_key_id,
            requested_scopes_json, principal_id, state, interval_seconds,
            next_poll_at, poll_violation_count, expires_at, created_at, updated_at
          ) VALUES ('device-old', ?, ?, 'device-prefix-old',
                    'device-digest-old', 'v1', 'user-digest-old', 'v1',
                    '["figma:context:read"]', ?, 'expired', 5,
                    '2025-01-01T00:00:00.000Z', 0,
                    '2025-01-01T00:00:00.000Z',
                    '2025-01-01T00:00:00.000Z',
                    '2025-01-01T00:00:00.000Z')`,
          args: [siteId, FIGMA_OAUTH_CLIENT_ID, userId],
        },
        {
          sql: `INSERT INTO aria_oauth_idempotency (
            id, access_token_id, idempotency_key, method, route_template,
            request_fingerprint, state, created_at, updated_at, expires_at
          ) VALUES ('idempotency-old', ?, 'key-old', 'POST', '/figma/imports',
                    'fingerprint', 'processing', '2025-01-01T00:00:00.000Z',
                    '2025-01-01T00:00:00.000Z',
                    '2025-01-02T00:00:00.000Z')`,
          args: [old.accessId],
        },
        {
          sql: `INSERT INTO aria_integration_audit (
            id, site_id, event_type, outcome, metadata_json, created_at,
            expires_at
          ) VALUES ('audit-old', ?, 'oauth.test', 'success', '{}',
                    '2025-01-01T00:00:00.000Z',
                    '2025-04-01T00:00:00.000Z')`,
          args: [siteId],
        },
      ],
      "write",
    );

    const result = await runOAuthMaintenance({
      database,
      now: "2026-07-20T12:00:00.000Z",
      limit: 50,
    });
    expect(result).toMatchObject({
      expiredFamilies: 1,
      purgedDeviceAuthorizations: 1,
      purgedAccessTokens: 1,
      purgedRefreshFamilies: 1,
      purgedGrants: 1,
      purgedIdempotency: 1,
      purgedAudit: 1,
    });
    const oldCounts = await client.execute({
      sql: `SELECT
        (SELECT COUNT(*) FROM aria_oauth_grants WHERE id = ?) AS grants,
        (SELECT COUNT(*) FROM aria_oauth_refresh_families WHERE id = ?)
          AS families,
        (SELECT COUNT(*) FROM aria_oauth_refresh_tokens WHERE family_id = ?)
          AS refresh_tokens,
        (SELECT COUNT(*) FROM aria_oauth_access_tokens WHERE id = ?)
          AS access_tokens`,
      args: [old.grantId, old.familyId, old.familyId, old.accessId],
    });
    expect(oldCounts.rows[0]).toMatchObject({
      grants: 0,
      families: 0,
      refresh_tokens: 0,
      access_tokens: 0,
    });

    const expiredState = await client.execute({
      sql: `SELECT f.status, f.revoke_reason, t.revoked_at AS access_revoked_at,
                   r.revoked_at AS refresh_revoked_at
            FROM aria_oauth_refresh_families f
            JOIN aria_oauth_access_tokens t ON t.refresh_family_id = f.id
            JOIN aria_oauth_refresh_tokens r ON r.family_id = f.id
            WHERE f.id = ?`,
      args: [expiring.familyId],
    });
    expect(expiredState.rows[0]).toMatchObject({
      status: "revoked",
      revoke_reason: "absolute_expiry",
    });
    expect(expiredState.rows[0]?.access_revoked_at).not.toBeNull();
    expect(expiredState.rows[0]?.refresh_revoked_at).not.toBeNull();
  });
});
