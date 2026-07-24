import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@libsql/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  database: null as unknown,
  storage: null as unknown,
  authAdapter: null as unknown,
}));

vi.mock("../../lib/api/database", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api/database")>()),
  getApiSqlDatabase: vi.fn(async () => state.database),
}));
vi.mock("../../lib/storage/getStorageAdapter", () => ({
  getStorageAdapterAsync: vi.fn(async () => state.storage),
}));
vi.mock("../../lib/auth/getAuthAdapter", () => ({
  getAuthAdapterAsync: vi.fn(async () => state.authAdapter),
}));

import { authenticateApiRequest } from "../../lib/api/auth";
import {
  createRawApiToken,
  hmacApiValue,
  readApiKeyring,
  verifyApiValue,
} from "../../lib/api/crypto";
import { LibSqlApiSqlDatabase } from "../../lib/api/database";
import { ApiRepository } from "../../lib/api/repository";
import type { ApiScope } from "../../lib/api/schemas";

const user = {
  id: "10000000-0000-4000-8000-000000000001",
  username: "api-user",
  email: "api@example.test",
  role: "administrator" as const,
  totpEnabled: false,
};
const rawKey = Uint8Array.from({ length: 32 }, (_, index) => 255 - index);
let binaryKey = "";
for (const byte of rawKey) binaryKey += String.fromCharCode(byte);
const locals = {
  cfBindings: {
    ARIA_API_KEYRING_KEY_ID: "v1",
    ARIA_API_KEYRING_KEY_V1: btoa(binaryKey),
  },
};

describe("site API authentication", () => {
  let repository: ApiRepository;
  let siteId: string;

  beforeEach(async () => {
    const client = createClient({ url: ":memory:" });
    await client.executeMultiple(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE aria_users (id TEXT PRIMARY KEY);
      INSERT INTO aria_users (id) VALUES ('${user.id}');
    `);
    for (const migration of [
      "0002_api_foundation.sql",
      "0003_api_idempotency_leases.sql",
    ]) {
      await client.executeMultiple(
        await readFile(
          resolve(process.cwd(), `aria/migrations/${migration}`),
          "utf8",
        ),
      );
    }
    state.database = new LibSqlApiSqlDatabase(client);
    repository = new ApiRepository(state.database as LibSqlApiSqlDatabase);
    siteId = await repository.getOrCreateSiteIdentity(
      "20000000-0000-4000-8000-000000000001",
    );
    state.storage = {
      getSiteSettings: vi.fn(async () => null),
      consumeRateLimit: vi.fn(async (input: { limit: number }) => ({
        allowed: true,
        count: 1,
        remaining: input.limit - 1,
        resetAt: Date.now() + 60_000,
      })),
    };
    state.authAdapter = { getUserById: vi.fn(async () => user) };
  });

  async function credential(
    options: {
      scopes?: Array<"entries:read" | "entries:write">;
      expiresAt?: string | null;
      revoked?: boolean;
      boundSiteId?: string;
    } = {},
  ) {
    const raw = createRawApiToken();
    const stored = await repository.insertCredential({
      id: crypto.randomUUID(),
      siteId: options.boundSiteId ?? siteId,
      kind: "personal",
      principalId: user.id,
      createdById: user.id,
      name: "Test",
      tokenPrefix: raw.prefix,
      tokenDigest: await hmacApiValue(
        readApiKeyring(locals),
        "credential",
        raw.token,
      ),
      keyId: "v1",
      scopes: options.scopes ?? ["entries:read"],
      expiresAt: options.expiresAt ?? null,
    });
    if (options.revoked) await repository.revokeCredential(stored.id);
    return { raw: raw.token, stored };
  }

  async function authenticate(
    raw: string,
    scopes: readonly ApiScope[] = ["entries:read"],
  ) {
    return authenticateApiRequest({
      request: new Request("https://example.test/api/v1/collections", {
        headers: { Authorization: `Bearer ${raw}` },
      }),
      locals,
      requestId: crypto.randomUUID(),
      requiredScopes: scopes,
    });
  }

  it("reconstructs the current principal for a valid scoped credential", async () => {
    const created = await credential();
    const lookedUp = await repository.getCredentialByPrefix(
      created.stored.tokenPrefix,
    );
    expect(lookedUp).not.toBeNull();
    await expect(
      verifyApiValue(
        readApiKeyring(locals, lookedUp!.keyId),
        "credential",
        created.raw,
        lookedUp!.tokenDigest,
      ),
    ).resolves.toBe(true);
    const result = await authenticate(created.raw);
    expect(result.siteId).toBe(siteId);
    expect(result.user).toEqual(user);
    expect(
      (result.actionContext.locals as { user?: typeof user }).user,
    ).toEqual(user);
  });

  it("rejects a valid token that lacks the route scope", async () => {
    const created = await credential({ scopes: ["entries:read"] });
    await expect(
      authenticate(created.raw, ["entries:write"]),
    ).rejects.toMatchObject({
      status: 403,
      code: "forbidden",
    });
  });

  it.each([
    ["revoked", { revoked: true }],
    ["expired", { expiresAt: "2020-01-01T00:00:00.000Z" }],
    ["wrong-site", { boundSiteId: "20000000-0000-4000-8000-000000000099" }],
  ] as const)("rejects %s credentials", async (_label, options) => {
    const created = await credential(options);
    await expect(authenticate(created.raw)).rejects.toMatchObject({
      status: 401,
      code: "unauthorized",
    });
  });

  it("rejects a modified secret even when its display prefix exists", async () => {
    const created = await credential();
    const replacement = created.raw.endsWith("x") ? "y" : "x";
    await expect(
      authenticate(`${created.raw.slice(0, -1)}${replacement}`),
    ).rejects.toMatchObject({
      status: 401,
      code: "unauthorized",
    });
  });
});
