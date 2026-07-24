import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createRawApiToken,
  hmacApiValue,
  readApiKeyring,
  verifyApiValue,
} from "../../lib/api/crypto";
import { createEntryCursor, parseEntryCursor } from "../../lib/api/cursor";
import { LibSqlApiSqlDatabase } from "../../lib/api/database";
import { entryEtag, requireEntryIfMatch } from "../../lib/api/http";
import { apiJson } from "../../lib/api/http";
import { runIdempotentMutation } from "../../lib/api/idempotency";
import { ApiRepository } from "../../lib/api/repository";

const key = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
let binary = "";
for (const byte of key) binary += String.fromCharCode(byte);
const keyBase64 = btoa(binary);
const locals = {
  cfBindings: {
    ARIA_API_KEYRING_KEY_ID: "v1",
    ARIA_API_KEYRING_KEY_V1: keyBase64,
  },
};

describe("site API cryptographic boundaries", () => {
  it("stores and verifies a purpose-derived HMAC without storing the token", async () => {
    const keyring = readApiKeyring(locals);
    const raw = createRawApiToken();
    const digest = await hmacApiValue(keyring, "credential", raw.token);

    expect(raw.token).toMatch(/^aria_api_/u);
    expect(digest).not.toContain(raw.token);
    await expect(
      verifyApiValue(keyring, "credential", raw.token, digest),
    ).resolves.toBe(true);
    await expect(
      verifyApiValue(keyring, "credential", `${raw.token}x`, digest),
    ).resolves.toBe(false);
    await expect(
      verifyApiValue(keyring, "cursor", raw.token, digest),
    ).resolves.toBe(false);
  });

  it("binds signed cursors to site, collection, filters, and expiry", async () => {
    const site = "10000000-0000-4000-8000-000000000001";
    const cursor = await createEntryCursor(locals, {
      site,
      resource: "entries",
      collectionId: "posts",
      binding: "status:published",
      page: 2,
      index: 7,
      pageSize: 25,
    });
    await expect(
      parseEntryCursor(locals, cursor, {
        site,
        collectionId: "posts",
        binding: "status:published",
      }),
    ).resolves.toMatchObject({ page: 2, index: 7, pageSize: 25 });
    await expect(
      parseEntryCursor(locals, cursor, {
        site,
        collectionId: "private-posts",
        binding: "status:published",
      }),
    ).rejects.toMatchObject({ status: 400, code: "bad_request" });
  });
});

describe("site API persistence", () => {
  let client: Client;
  let repository: ApiRepository;
  const principalId = "20000000-0000-4000-8000-000000000001";

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.executeMultiple(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE aria_users (id TEXT PRIMARY KEY);
      CREATE TABLE aria_page_meta (
        id TEXT PRIMARY KEY,
        status TEXT,
        current_version TEXT NOT NULL,
        scheduled_for TEXT
      );
      CREATE TABLE aria_entries (
        id TEXT PRIMARY KEY,
        collection_id TEXT NOT NULL,
        status TEXT NOT NULL,
        version TEXT NOT NULL,
        scheduled_for TEXT
      );
    `);
    await client.execute({
      sql: "INSERT INTO aria_users (id) VALUES (?)",
      args: [principalId],
    });
    for (const migration of [
      "0002_api_foundation.sql",
      "0003_api_idempotency_leases.sql",
      "0004_api_lifecycle_hardening.sql",
    ]) {
      await client.executeMultiple(
        await readFile(
          resolve(process.cwd(), `aria/migrations/${migration}`),
          "utf8",
        ),
      );
    }
    repository = new ApiRepository(new LibSqlApiSqlDatabase(client));
  });

  it("creates exactly one immutable site identity", async () => {
    const first = await repository.getOrCreateSiteIdentity(
      "30000000-0000-4000-8000-000000000001",
      "2026-07-18T12:00:00.000Z",
    );
    const second = await repository.getOrCreateSiteIdentity(
      "30000000-0000-4000-8000-000000000002",
      "2026-07-18T12:01:00.000Z",
    );
    expect(second).toBe(first);
  });

  it("persists only a credential digest and supports revocation", async () => {
    const siteId = await repository.getOrCreateSiteIdentity();
    const raw = createRawApiToken();
    const digest = await hmacApiValue(
      readApiKeyring(locals),
      "credential",
      raw.token,
    );
    const credential = await repository.insertCredential({
      id: "40000000-0000-4000-8000-000000000001",
      siteId,
      kind: "personal",
      principalId,
      createdById: principalId,
      name: "CI",
      tokenPrefix: raw.prefix,
      tokenDigest: digest,
      keyId: "v1",
      scopes: ["entries:read"],
      expiresAt: null,
      now: "2026-07-18T12:00:00.000Z",
    });
    expect(credential.tokenDigest).toBe(digest);
    expect(JSON.stringify(credential)).not.toContain(raw.token);
    await expect(repository.revokeCredential(credential.id)).resolves.toBe(
      true,
    );
    await expect(repository.revokeCredential(credential.id)).resolves.toBe(
      false,
    );
  });

  it("removes revoked credentials while retaining an audit record", async () => {
    const credential = await repository.insertCredential({
      id: "40000000-0000-4000-8000-000000000012",
      siteId: await repository.getOrCreateSiteIdentity(),
      kind: "personal",
      principalId,
      createdById: principalId,
      name: "Retired CI",
      tokenPrefix: "retired12345",
      tokenDigest: "digest-value-that-is-long-enough-for-schema-validation",
      keyId: "v1",
      scopes: ["entries:read"],
      expiresAt: null,
    });
    await repository.revokeCredential(credential.id);

    await expect(
      repository.removeRevokedCredentialWithAudit({
        credential: (await repository.getCredentialById(credential.id))!,
        actorId: principalId,
        requestId: "50000000-0000-4000-8000-000000000012",
        now: "2026-07-20T12:00:00.000Z",
      }),
    ).resolves.toBe(true);
    await expect(repository.getCredentialById(credential.id)).resolves.toBeNull();
    await expect(
      client.execute({
        sql: "SELECT event_type, credential_id FROM aria_api_security_audit WHERE event_type = 'credential.removed'",
        args: [],
      }),
    ).resolves.toMatchObject({
      rows: [{ event_type: "credential.removed", credential_id: null }],
    });
  });

  it("does not remove an active credential", async () => {
    const credential = await repository.insertCredential({
      id: "40000000-0000-4000-8000-000000000013",
      siteId: await repository.getOrCreateSiteIdentity(),
      kind: "personal",
      principalId,
      createdById: principalId,
      name: "Still active",
      tokenPrefix: "active12345",
      tokenDigest: "digest-value-that-is-long-enough-for-schema-validation",
      keyId: "v1",
      scopes: ["entries:read"],
      expiresAt: null,
    });

    await expect(
      repository.removeRevokedCredentialWithAudit({
        credential,
        actorId: principalId,
        requestId: "50000000-0000-4000-8000-000000000013",
      }),
    ).resolves.toBe(false);
    await expect(repository.getCredentialById(credential.id)).resolves.not.toBeNull();
  });

  it("keeps a service credential when its creator is deleted", async () => {
    const creatorId = "20000000-0000-4000-8000-000000000002";
    await client.execute({
      sql: "INSERT INTO aria_users (id) VALUES (?)",
      args: [creatorId],
    });
    const credential = await repository.insertCredential({
      id: "40000000-0000-4000-8000-000000000010",
      siteId: await repository.getOrCreateSiteIdentity(),
      kind: "service",
      principalId,
      createdById: creatorId,
      name: "Automation",
      tokenPrefix: "service12345",
      tokenDigest: "digest-value-that-is-long-enough-for-schema-validation",
      keyId: "v1",
      scopes: ["entries:read"],
      expiresAt: null,
    });

    await client.execute({
      sql: "DELETE FROM aria_users WHERE id = ?",
      args: [creatorId],
    });

    await expect(
      repository.getCredentialById(credential.id),
    ).resolves.toMatchObject({
      principalId,
      createdById: null,
    });
  });

  it("commits credential creation and its audit atomically", async () => {
    await client.executeMultiple(`
      CREATE TRIGGER reject_credential_audit
      BEFORE INSERT ON aria_api_security_audit
      WHEN NEW.event_type = 'credential.created'
      BEGIN
        SELECT RAISE(ABORT, 'audit unavailable');
      END;
    `);
    const id = "40000000-0000-4000-8000-000000000011";
    await expect(
      repository.insertCredentialWithAudit({
        id,
        siteId: await repository.getOrCreateSiteIdentity(),
        kind: "personal",
        principalId,
        createdById: principalId,
        name: "Atomic",
        tokenPrefix: "atomic12345",
        tokenDigest: "digest-value-that-is-long-enough-for-schema-validation",
        keyId: "v1",
        scopes: ["entries:read"],
        expiresAt: null,
        requestId: "50000000-0000-4000-8000-000000000011",
      }),
    ).rejects.toThrow(/audit unavailable/u);
    await expect(repository.getCredentialById(id)).resolves.toBeNull();
  });

  it("replays matching idempotency records and rejects key reuse", async () => {
    const siteId = await repository.getOrCreateSiteIdentity();
    const credential = await repository.insertCredential({
      id: "40000000-0000-4000-8000-000000000002",
      siteId,
      kind: "personal",
      principalId,
      createdById: principalId,
      name: "Deploy",
      tokenPrefix: "prefix12345",
      tokenDigest: "digest-value-that-is-long-enough-for-schema-validation",
      keyId: "v1",
      scopes: ["entries:write"],
      expiresAt: null,
      now: "2026-07-18T12:00:00.000Z",
    });
    const base = {
      credentialId: credential.id,
      key: "idempotency-key-0001",
      method: "POST",
      routeTemplate: "/entries",
      fingerprint: "fingerprint-a",
      now: "2026-07-18T12:00:00.000Z",
      expiresAt: "2026-07-19T12:00:00.000Z",
    };
    const claim = await repository.claimIdempotency(base);
    expect(claim).toMatchObject({ kind: "claimed" });
    if (claim.kind !== "claimed") throw new Error("Expected idempotency claim");
    await expect(repository.claimIdempotency(base)).resolves.toEqual({
      kind: "processing",
    });
    await repository.completeIdempotency({
      credentialId: credential.id,
      key: base.key,
      fingerprint: base.fingerprint,
      leaseToken: claim.leaseToken,
      now: "2026-07-18T12:00:01.000Z",
      response: {
        status: 201,
        body: { success: true, data: { id: "entry-1" } },
        headers: { Location: "/entries/entry-1" },
        resourceVersion: '"aria-entry-v1"',
      },
    });
    await expect(repository.claimIdempotency(base)).resolves.toMatchObject({
      kind: "replay",
      response: { status: 201 },
    });
    await expect(
      repository.claimIdempotency({ ...base, fingerprint: "fingerprint-b" }),
    ).resolves.toEqual({ kind: "conflict" });
  });

  it("replays a completed mutation without invoking it or rechecking state", async () => {
    const siteId = await repository.getOrCreateSiteIdentity();
    const credential = await repository.insertCredential({
      id: "40000000-0000-4000-8000-000000000003",
      siteId,
      kind: "personal",
      principalId,
      createdById: principalId,
      name: "Replay",
      tokenPrefix: "prefix67890",
      tokenDigest: "digest-value-that-is-long-enough-for-schema-validation",
      keyId: "v1",
      scopes: ["entries:write"],
      expiresAt: null,
    });
    const request = new Request("https://example.test/api/v1/entries/one", {
      method: "PATCH",
      headers: { "Idempotency-Key": "idempotency-key-0002" },
    });
    let calls = 0;
    const first = await runIdempotentMutation({
      request,
      requestId: "50000000-0000-4000-8000-000000000001",
      repository,
      credentialId: credential.id,
      siteId,
      actorId: principalId,
      routeTemplate: "/entries/{entryId}",
      validatedBody: { title: "Updated" },
      ifMatch: "v1",
      run: async () => {
        calls += 1;
        return apiJson(
          "50000000-0000-4000-8000-000000000001",
          { id: "one", version: "v2" },
          { headers: { ETag: '"aria-entry-v2"' } },
        );
      },
    });
    const replay = await runIdempotentMutation({
      request,
      requestId: "50000000-0000-4000-8000-000000000002",
      repository,
      credentialId: credential.id,
      siteId,
      actorId: principalId,
      routeTemplate: "/entries/{entryId}",
      validatedBody: { title: "Updated" },
      ifMatch: "v1",
      run: async () => {
        calls += 1;
        throw new Error("state should not be checked on replay");
      },
    });
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.headers.get("Idempotency-Replayed")).toBe("true");
    expect(replay.headers.get("X-Aria-Request-Id")).toBe(
      "50000000-0000-4000-8000-000000000002",
    );
    expect(calls).toBe(1);
  });
});

describe("site API preconditions", () => {
  it("accepts one strong Aria ETag and rejects weak or wildcard matches", () => {
    const etag = entryEtag("version-1");
    expect(
      requireEntryIfMatch(
        new Request("https://example.test/api", {
          headers: { "If-Match": etag },
        }),
      ),
    ).toBe("version-1");
    for (const value of ["*", `W/${etag}`, `${etag}, ${etag}`]) {
      expect(() =>
        requireEntryIfMatch(
          new Request("https://example.test/api", {
            headers: { "If-Match": value },
          }),
        ),
      ).toThrow();
    }
  });
});
