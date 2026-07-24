import { createClient, type Client } from "@libsql/client";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  database: null as unknown,
  storage: null as unknown,
}));

vi.mock("../../lib/api/database", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api/database")>()),
  getApiSqlDatabase: vi.fn(async () => state.database),
}));
vi.mock("../../lib/storage/getStorageAdapter", () => ({
  getStorageAdapterAsync: vi.fn(async () => state.storage),
}));

import { hmacApiValue, readApiKeyring } from "../../lib/api/crypto";
import { LibSqlApiSqlDatabase } from "../../lib/api/database";
import { ApiRepository } from "../../lib/api/repository";
import { createOAuthDeviceCode, createOAuthUserCode } from "../../lib/oauth/codes";
import { inspectDeviceUserCode } from "../../lib/oauth/deviceFlow";
import { OAuthRepository } from "../../lib/oauth/repository";
import { normalizeUserCode } from "../../lib/oauth/schemas";

function keyBase64(seed: number): string {
  const bytes = Uint8Array.from({ length: 32 }, (_, index) => (index + seed) % 256);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

describe("OAuth user-code key rotation", () => {
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
    state.database = database;
    state.storage = {
      getSiteSettings: vi.fn(async () => null),
    };
    repository = new OAuthRepository(database);
    siteId = await new ApiRepository(database).getOrCreateSiteIdentity();
    await repository.ensureBuiltInFigmaClient(siteId);
  });

  afterEach(() => client.close());

  it("finds a pending user code hashed with a prior keyring version", async () => {
    const v1Locals = {
      cfBindings: {
        ARIA_API_KEYRING_KEY_ID: "v1",
        ARIA_API_KEYRING_KEY_V1: keyBase64(1),
        ARIA_API_KEYRING_KEY_V2: keyBase64(2),
        ARIA_OAUTH_ENABLED: "true",
        ARIA_CANONICAL_ORIGIN: "https://site.example",
      },
    };
    const v1 = readApiKeyring(v1Locals, "v1");
    const device = createOAuthDeviceCode();
    const userCode = createOAuthUserCode();
    const now = "2026-07-20T12:00:00.000Z";
    await repository.createDeviceAuthorization({
      id: "device-rotated",
      siteId,
      clientId: "aria-figma-plugin",
      deviceCodePrefix: device.prefix,
      deviceCodeDigest: await hmacApiValue(v1, "oauth-device", device.code),
      deviceCodeKeyId: v1.keyId,
      userCodeDigest: await hmacApiValue(
        v1,
        "oauth-user-code",
        normalizeUserCode(userCode),
      ),
      userCodeKeyId: v1.keyId,
      requestedScopes: ["figma:context:read"],
      intervalSeconds: 5,
      expiresAt: "2026-07-20T12:10:00.000Z",
      now,
    });

    const rotatedLocals = {
      cfBindings: {
        ARIA_API_KEYRING_KEY_ID: "v2",
        ARIA_API_KEYRING_KEY_V1: keyBase64(1),
        ARIA_API_KEYRING_KEY_V2: keyBase64(2),
        ARIA_OAUTH_ENABLED: "true",
        ARIA_CANONICAL_ORIGIN: "https://site.example",
      },
    };

    await expect(
      inspectDeviceUserCode({
        locals: rotatedLocals,
        userCode,
        now: new Date("2026-07-20T12:01:00.000Z"),
      }),
    ).resolves.toMatchObject({
      id: "device-rotated",
      deviceCodeKeyId: "v1",
      state: "pending",
    });
  });
});
