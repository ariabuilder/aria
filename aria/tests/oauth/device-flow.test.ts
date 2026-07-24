import { createClient, type Client } from "@libsql/client";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  hmacApiValue,
  readApiKeyring,
  verifyApiValue,
} from "../../lib/api/crypto";
import { LibSqlApiSqlDatabase } from "../../lib/api/database";
import { ApiRepository } from "../../lib/api/repository";
import {
  createOAuthAccessToken,
  createOAuthDeviceCode,
  createOAuthRefreshToken,
  createOAuthUserCode,
  parseOAuthAccessToken,
  parseOAuthDeviceCode,
  parseOAuthRefreshToken,
} from "../../lib/oauth/codes";
import { readOAuthConfiguration } from "../../lib/oauth/config";
import { OAuthRepository } from "../../lib/oauth/repository";

const keyBytes = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
let keyBinary = "";
for (const byte of keyBytes) keyBinary += String.fromCharCode(byte);
const keyBase64 = btoa(keyBinary);
const locals = {
  cfBindings: {
    ARIA_API_KEYRING_KEY_ID: "v1",
    ARIA_API_KEYRING_KEY_V1: keyBase64,
    ARIA_OAUTH_ENABLED: "true",
    ARIA_CANONICAL_ORIGIN: "https://site.example",
  },
};

describe("OAuth configuration and code boundaries", () => {
  it("requires an explicit canonical HTTPS issuer", () => {
    expect(readOAuthConfiguration(locals)).toEqual({
      canonicalOrigin: "https://site.example",
    });
    expect(() =>
      readOAuthConfiguration({
        cfBindings: {
          ARIA_OAUTH_ENABLED: "true",
          ARIA_CANONICAL_ORIGIN: "http://site.example",
        },
      }),
    ).toThrow("OAUTH_CANONICAL_ORIGIN_INVALID");
  });

  it("creates high-entropy opaque codes and purpose-separates their digests", async () => {
    const keyring = readApiKeyring(locals);
    const device = createOAuthDeviceCode();
    const userCode = createOAuthUserCode();
    const digest = await hmacApiValue(keyring, "oauth-device", device.code);

    expect(parseOAuthDeviceCode(device.code)).toEqual(device);
    expect(userCode).toMatch(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/u);
    await expect(
      verifyApiValue(keyring, "oauth-device", device.code, digest),
    ).resolves.toBe(true);
    await expect(
      verifyApiValue(keyring, "credential", device.code, digest),
    ).resolves.toBe(false);
  });
});

describe("OAuth device authorization persistence", () => {
  let client: Client;
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
    await client.execute(`INSERT INTO aria_users (
      id, username, email, password_hash, role, created_at
    ) VALUES ('oauth-user', 'oauth-user', 'oauth@example.test', 'unused',
              'administrator', '2026-07-20T12:00:00.000Z')`);
    const database = new LibSqlApiSqlDatabase(client);
    repository = new OAuthRepository(database);
    siteId = await new ApiRepository(database).getOrCreateSiteIdentity();
    await repository.ensureBuiltInFigmaClient(siteId);
  });

  afterEach(() => client.close());

  async function seedTokenFamily(suffix: string) {
    const keyring = readApiKeyring(locals);
    const access = createOAuthAccessToken();
    const refresh = createOAuthRefreshToken();
    const device = createOAuthDeviceCode();
    const now = "2026-07-20T12:00:00.000Z";
    const deviceId = `device-${suffix}`;
    const familyId = `family-${suffix}`;
    await repository.createDeviceAuthorization({
      id: deviceId,
      siteId,
      clientId: "aria-figma-plugin",
      deviceCodePrefix: device.prefix,
      deviceCodeDigest: `device-digest-${suffix}`,
      deviceCodeKeyId: "v1",
      userCodeDigest: `user-digest-${suffix}`,
      userCodeKeyId: "v1",
      requestedScopes: ["figma:context:read"],
      intervalSeconds: 5,
      expiresAt: "2026-07-20T12:10:00.000Z",
      now,
    });
    await repository.approveDevice({
      id: deviceId,
      principalId: "oauth-user",
      scopes: ["figma:context:read"],
      now,
    });
    await repository.claimApprovedExchange({
      id: deviceId,
      leaseToken: `lease-${suffix}`,
      leaseExpiresAt: "2026-07-20T12:00:30.000Z",
      now,
    });
    await repository.finalizeDeviceExchange({
      deviceId,
      exchangeLeaseToken: `lease-${suffix}`,
      siteId,
      clientId: "aria-figma-plugin",
      proposedGrantId: `grant-${suffix}`,
      principalId: "oauth-user",
      scopes: ["figma:context:read"],
      refreshFamilyId: familyId,
      refreshFamilyExpiresAt: "2026-08-19T12:00:00.000Z",
      refreshTokenId: `refresh-${suffix}`,
      refreshTokenPrefix: refresh.prefix,
      refreshTokenDigest: await hmacApiValue(
        keyring,
        "oauth-refresh",
        refresh.token,
      ),
      refreshTokenKeyId: "v1",
      accessTokenId: `access-${suffix}`,
      accessTokenPrefix: access.prefix,
      accessTokenDigest: await hmacApiValue(
        keyring,
        "oauth-access",
        access.token,
      ),
      accessTokenKeyId: "v1",
      accessTokenExpiresAt: "2026-07-20T12:15:00.000Z",
      now,
    });
    return { access, device, familyId, keyring, refresh };
  }

  it("enforces one-way approval, one poll owner, and one exchange owner", async () => {
    const keyring = readApiKeyring(locals);
    const device = createOAuthDeviceCode();
    const userCode = createOAuthUserCode();
    const now = "2026-07-20T12:00:00.000Z";
    await repository.createDeviceAuthorization({
      id: "device-1",
      siteId,
      clientId: "aria-figma-plugin",
      deviceCodePrefix: device.prefix,
      deviceCodeDigest: await hmacApiValue(
        keyring,
        "oauth-device",
        device.code,
      ),
      deviceCodeKeyId: keyring.keyId,
      userCodeDigest: await hmacApiValue(
        keyring,
        "oauth-user-code",
        userCode.replace("-", ""),
      ),
      userCodeKeyId: keyring.keyId,
      requestedScopes: ["figma:context:read", "figma:imports:write"],
      intervalSeconds: 5,
      expiresAt: "2026-07-20T12:10:00.000Z",
      now,
    });

    await expect(
      repository.approveDevice({
        id: "device-1",
        principalId: "oauth-user",
        scopes: ["figma:context:read"],
        now: "2026-07-20T12:00:01.000Z",
      }),
    ).resolves.toBe(true);
    await expect(
      repository.denyDevice("device-1", "2026-07-20T12:00:02.000Z"),
    ).resolves.toBe(false);
    await expect(
      repository.claimPoll({
        id: "device-1",
        now: "2026-07-20T12:00:05.000Z",
        nextPollAt: "2026-07-20T12:00:10.000Z",
      }),
    ).resolves.toBe(true);
    await expect(
      repository.claimPoll({
        id: "device-1",
        now: "2026-07-20T12:00:05.000Z",
        nextPollAt: "2026-07-20T12:00:10.000Z",
      }),
    ).resolves.toBe(false);
    await expect(
      repository.claimApprovedExchange({
        id: "device-1",
        leaseToken: "lease-1",
        leaseExpiresAt: "2026-07-20T12:00:35.000Z",
        now: "2026-07-20T12:00:05.000Z",
      }),
    ).resolves.toBe(true);
    await expect(
      repository.claimApprovedExchange({
        id: "device-1",
        leaseToken: "lease-2",
        leaseExpiresAt: "2026-07-20T12:00:35.000Z",
        now: "2026-07-20T12:00:05.000Z",
      }),
    ).resolves.toBe(false);
  });

  it("stores only access and refresh digests during device exchange", async () => {
    const { access, device, familyId, refresh } = await seedTokenFamily("2");

    const stored = JSON.stringify(
      (
        await client.execute(
          `SELECT token_digest FROM aria_oauth_access_tokens
           UNION ALL SELECT token_digest FROM aria_oauth_refresh_tokens`,
        )
      ).rows,
    );
    expect(stored).not.toContain(access.token);
    expect(stored).not.toContain(refresh.token);
    expect(parseOAuthAccessToken(access.token)?.prefix).toBe(access.prefix);
    expect(parseOAuthRefreshToken(refresh.token)?.prefix).toBe(refresh.prefix);
    await expect(
      repository.findRefreshTokenByPrefix(refresh.prefix),
    ).resolves.toMatchObject({
      familyId,
      generation: 1,
      currentGeneration: 1,
      familyStatus: "active",
    });
    expect(await repository.findDeviceByPrefix(device.prefix)).toMatchObject({
      state: "consumed",
    });
  });

  it("rotates once and revokes the full family when the old token is replayed", async () => {
    const { familyId, keyring, refresh } = await seedTokenFamily("3");
    const stored = await repository.findRefreshTokenByPrefix(refresh.prefix);
    expect(stored).not.toBeNull();
    const nextRefresh = createOAuthRefreshToken();
    const nextAccess = createOAuthAccessToken();
    await expect(
      repository.rotateRefreshToken({
        tokenId: stored!.id,
        familyId,
        generation: stored!.generation,
        newRefreshTokenId: "refresh-3-next",
        newRefreshTokenPrefix: nextRefresh.prefix,
        newRefreshTokenDigest: await hmacApiValue(
          keyring,
          "oauth-refresh",
          nextRefresh.token,
        ),
        newRefreshTokenKeyId: "v1",
        newRefreshTokenExpiresAt: stored!.absoluteExpiresAt,
        accessTokenId: "access-3-next",
        accessTokenPrefix: nextAccess.prefix,
        accessTokenDigest: await hmacApiValue(
          keyring,
          "oauth-access",
          nextAccess.token,
        ),
        accessTokenKeyId: "v1",
        accessTokenExpiresAt: "2026-07-20T12:20:00.000Z",
        now: "2026-07-20T12:05:00.000Z",
      }),
    ).resolves.toBe(true);

    await expect(
      repository.rotateRefreshToken({
        tokenId: stored!.id,
        familyId,
        generation: stored!.generation,
        newRefreshTokenId: "refresh-3-replay",
        newRefreshTokenPrefix: createOAuthRefreshToken().prefix,
        newRefreshTokenDigest: "replay-digest",
        newRefreshTokenKeyId: "v1",
        newRefreshTokenExpiresAt: stored!.absoluteExpiresAt,
        accessTokenId: "access-3-replay",
        accessTokenPrefix: createOAuthAccessToken().prefix,
        accessTokenDigest: "replay-access-digest",
        accessTokenKeyId: "v1",
        accessTokenExpiresAt: "2026-07-20T12:20:01.000Z",
        now: "2026-07-20T12:05:01.000Z",
      }),
    ).resolves.toBe(false);
    await repository.revokeRefreshFamily({
      familyId,
      reason: "refresh_reuse",
      now: "2026-07-20T12:05:01.000Z",
    });

    const family = await client.execute({
      sql: `SELECT status, revoke_reason FROM aria_oauth_refresh_families
            WHERE id = ?`,
      args: [familyId],
    });
    expect(family.rows[0]).toMatchObject({
      status: "revoked",
      revoke_reason: "refresh_reuse",
    });
    const activeAccess = await client.execute({
      sql: `SELECT COUNT(*) AS count FROM aria_oauth_access_tokens
            WHERE refresh_family_id = ? AND revoked_at IS NULL`,
      args: [familyId],
    });
    expect(Number(activeAccess.rows[0]?.count)).toBe(0);
  });

  it("replaces an existing connection and revokes its prior token family", async () => {
    const first = await seedTokenFamily("4-first");
    const second = await seedTokenFamily("4-second");

    const families = await client.execute({
      sql: `SELECT id, status, revoke_reason
            FROM aria_oauth_refresh_families WHERE id IN (?, ?) ORDER BY id`,
      args: [first.familyId, second.familyId],
    });
    expect(families.rows).toEqual([
      expect.objectContaining({
        id: first.familyId,
        status: "revoked",
        revoke_reason: "new_device_authorization",
      }),
      expect.objectContaining({
        id: second.familyId,
        status: "active",
        revoke_reason: null,
      }),
    ]);
    const firstAccess = await repository.findAccessTokenByPrefix(
      first.access.prefix,
    );
    const firstRefresh = await repository.findRefreshTokenByPrefix(
      first.refresh.prefix,
    );
    expect(firstAccess?.revokedAt).not.toBeNull();
    expect(firstRefresh?.revokedAt).not.toBeNull();
  });

  it("does not revoke an existing connection when an exchange lease is stale", async () => {
    const existing = await seedTokenFamily("5-existing");
    const device = createOAuthDeviceCode();
    const access = createOAuthAccessToken();
    const refresh = createOAuthRefreshToken();
    const now = "2026-07-20T12:03:00.000Z";
    await repository.createDeviceAuthorization({
      id: "device-5-stale",
      siteId,
      clientId: "aria-figma-plugin",
      deviceCodePrefix: device.prefix,
      deviceCodeDigest: "device-digest-5-stale",
      deviceCodeKeyId: "v1",
      userCodeDigest: "user-digest-5-stale",
      userCodeKeyId: "v1",
      requestedScopes: ["figma:context:read"],
      intervalSeconds: 5,
      expiresAt: "2026-07-20T12:10:00.000Z",
      now,
    });
    await repository.approveDevice({
      id: "device-5-stale",
      principalId: "oauth-user",
      scopes: ["figma:context:read"],
      now,
    });
    await repository.claimApprovedExchange({
      id: "device-5-stale",
      leaseToken: "lease-5-current",
      leaseExpiresAt: "2026-07-20T12:03:30.000Z",
      now,
    });

    await expect(
      repository.finalizeDeviceExchange({
        deviceId: "device-5-stale",
        exchangeLeaseToken: "lease-5-old",
        siteId,
        clientId: "aria-figma-plugin",
        proposedGrantId: "grant-5-stale",
        principalId: "oauth-user",
        scopes: ["figma:context:read"],
        refreshFamilyId: "family-5-stale",
        refreshFamilyExpiresAt: "2026-08-19T12:03:00.000Z",
        refreshTokenId: "refresh-5-stale",
        refreshTokenPrefix: refresh.prefix,
        refreshTokenDigest: await hmacApiValue(
          existing.keyring,
          "oauth-refresh",
          refresh.token,
        ),
        refreshTokenKeyId: "v1",
        accessTokenId: "access-5-stale",
        accessTokenPrefix: access.prefix,
        accessTokenDigest: await hmacApiValue(
          existing.keyring,
          "oauth-access",
          access.token,
        ),
        accessTokenKeyId: "v1",
        accessTokenExpiresAt: "2026-07-20T12:18:00.000Z",
        now,
      }),
    ).rejects.toThrow("OAUTH_DEVICE_EXCHANGE_LOST");

    expect(
      (await repository.findRefreshTokenByPrefix(existing.refresh.prefix))
        ?.familyStatus,
    ).toBe("active");
    expect(
      (await repository.findAccessTokenByPrefix(existing.access.prefix))
        ?.revokedAt,
    ).toBeNull();
    await expect(
      repository.findRefreshTokenByPrefix(refresh.prefix),
    ).resolves.toBeNull();
    await expect(
      repository.findDeviceByPrefix(device.prefix),
    ).resolves.toMatchObject({ state: "approved" });
  });

  it("revokes one access token or an entire refresh family at the right boundary", async () => {
    const { access, familyId, refresh } = await seedTokenFamily("6");
    const storedAccess = await repository.findAccessTokenByPrefix(
      access.prefix,
    );
    expect(storedAccess).not.toBeNull();

    await expect(
      repository.revokeAccessToken(
        storedAccess!.id,
        "2026-07-20T12:01:00.000Z",
      ),
    ).resolves.toBe(true);
    await expect(
      repository.revokeAccessToken(
        storedAccess!.id,
        "2026-07-20T12:01:01.000Z",
      ),
    ).resolves.toBe(false);
    expect(
      (await repository.findRefreshTokenByPrefix(refresh.prefix))?.familyStatus,
    ).toBe("active");

    await expect(
      repository.revokeRefreshFamily({
        familyId,
        reason: "token_revocation",
        now: "2026-07-20T12:02:00.000Z",
      }),
    ).resolves.toBe(true);
    const activeTokens = await client.execute({
      sql: `SELECT
              (SELECT COUNT(*) FROM aria_oauth_access_tokens
               WHERE refresh_family_id = ? AND revoked_at IS NULL) AS access_count,
              (SELECT COUNT(*) FROM aria_oauth_refresh_tokens
               WHERE family_id = ? AND revoked_at IS NULL) AS refresh_count`,
      args: [familyId, familyId],
    });
    expect(Number(activeTokens.rows[0]?.access_count)).toBe(0);
    expect(Number(activeTokens.rows[0]?.refresh_count)).toBe(0);

    const audits = await client.execute({
      sql: `SELECT resource_type FROM aria_integration_audit
            WHERE event_type = 'oauth.token.revoked' ORDER BY created_at`,
      args: [],
    });
    expect(audits.rows.map((row) => row.resource_type)).toEqual([
      "oauth.access_token",
      "oauth.refresh_family",
    ]);
  });
});
