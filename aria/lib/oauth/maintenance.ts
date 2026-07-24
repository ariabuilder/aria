import type { ApiSqlDatabase } from "../api/database";

const DAY_MS = 86_400_000;

export type OAuthMaintenanceResult = Readonly<{
  expiredDevices: number;
  expiredFamilies: number;
  purgedDeviceAuthorizations: number;
  purgedAccessTokens: number;
  purgedRefreshFamilies: number;
  purgedGrants: number;
  purgedIdempotency: number;
  purgedAudit: number;
}>;

/** Runs bounded, restart-safe lifecycle cleanup for OAuth operational state. */
export async function runOAuthMaintenance(input: {
  database: ApiSqlDatabase;
  now?: string;
  limit?: number;
  deviceRetentionDays?: number;
  securityRetentionDays?: number;
}): Promise<OAuthMaintenanceResult> {
  const now = input.now ?? new Date().toISOString();
  const limit = Math.min(Math.max(input.limit ?? 250, 1), 1_000);
  const deviceBefore = new Date(
    Date.parse(now) - (input.deviceRetentionDays ?? 7) * DAY_MS,
  ).toISOString();
  const securityBefore = new Date(
    Date.parse(now) - (input.securityRetentionDays ?? 90) * DAY_MS,
  ).toISOString();

  const expiredDevices = await input.database.execute(
    `UPDATE aria_oauth_device_authorizations
     SET state = 'expired', updated_at = ?, exchange_lease_token = NULL,
         exchange_lease_expires_at = NULL
     WHERE state IN ('pending', 'approved') AND expires_at <= ?
       AND (exchange_lease_token IS NULL OR exchange_lease_expires_at <= ?)`,
    [now, now, now],
  );
  const expiredFamilies = await input.database.execute(
    `UPDATE aria_oauth_refresh_families
     SET status = 'revoked', revoked_at = COALESCE(revoked_at, ?),
         revoke_reason = COALESCE(revoke_reason, 'absolute_expiry')
     WHERE status = 'active' AND absolute_expires_at <= ?`,
    [now, now],
  );
  await input.database.execute(
    `UPDATE aria_oauth_refresh_tokens SET revoked_at = COALESCE(revoked_at, ?)
     WHERE family_id IN (
       SELECT id FROM aria_oauth_refresh_families
       WHERE status = 'revoked' AND revoke_reason = 'absolute_expiry'
     )`,
    [now],
  );
  await input.database.execute(
    `UPDATE aria_oauth_access_tokens SET revoked_at = COALESCE(revoked_at, ?)
     WHERE refresh_family_id IN (
       SELECT id FROM aria_oauth_refresh_families
       WHERE status = 'revoked' AND revoke_reason = 'absolute_expiry'
     )`,
    [now],
  );

  const purgedIdempotency = await input.database.execute(
    `DELETE FROM aria_oauth_idempotency WHERE id IN (
       SELECT id FROM aria_oauth_idempotency WHERE expires_at <= ?
       ORDER BY expires_at, id LIMIT ?
     )`,
    [now, limit],
  );
  const purgedDeviceAuthorizations = await input.database.execute(
    `DELETE FROM aria_oauth_device_authorizations WHERE id IN (
       SELECT id FROM aria_oauth_device_authorizations
       WHERE state IN ('consumed', 'denied', 'expired') AND updated_at < ?
       ORDER BY updated_at, id LIMIT ?
     )`,
    [deviceBefore, limit],
  );
  const purgedAccessTokens = await input.database.execute(
    `DELETE FROM aria_oauth_access_tokens WHERE id IN (
       SELECT id FROM aria_oauth_access_tokens
       WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)
       ORDER BY COALESCE(revoked_at, expires_at), id LIMIT ?
     )`,
    [securityBefore, securityBefore, limit],
  );
  const purgedRefreshFamilies = await input.database.execute(
    `DELETE FROM aria_oauth_refresh_families WHERE id IN (
       SELECT f.id FROM aria_oauth_refresh_families f
       WHERE f.status = 'revoked'
         AND COALESCE(f.revoked_at, f.absolute_expires_at) < ?
         AND NOT EXISTS (
           SELECT 1 FROM aria_oauth_access_tokens t
           WHERE t.refresh_family_id = f.id
         )
       ORDER BY COALESCE(f.revoked_at, f.absolute_expires_at), f.id LIMIT ?
     )`,
    [securityBefore, limit],
  );
  const purgedGrants = await input.database.execute(
    `DELETE FROM aria_oauth_grants WHERE id IN (
       SELECT g.id FROM aria_oauth_grants g
       WHERE g.status = 'revoked' AND g.revoked_at < ?
         AND NOT EXISTS (
           SELECT 1 FROM aria_oauth_refresh_families f WHERE f.grant_id = g.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM aria_oauth_access_tokens t WHERE t.grant_id = g.id
         )
       ORDER BY g.revoked_at, g.id LIMIT ?
     )`,
    [securityBefore, limit],
  );
  const purgedAudit = await input.database.execute(
    `DELETE FROM aria_integration_audit WHERE id IN (
       SELECT id FROM aria_integration_audit WHERE expires_at <= ?
       ORDER BY expires_at, id LIMIT ?
     )`,
    [now, limit],
  );

  return {
    expiredDevices,
    expiredFamilies,
    purgedDeviceAuthorizations,
    purgedAccessTokens,
    purgedRefreshFamilies,
    purgedGrants,
    purgedIdempotency,
    purgedAudit,
  };
}
