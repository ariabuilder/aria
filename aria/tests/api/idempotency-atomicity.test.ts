import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createClient,
  type Client,
  type InStatement,
  type InValue,
} from "@libsql/client";
import { beforeEach, describe, expect, it } from "vitest";
import { LibSqlApiSqlDatabase } from "../../lib/api/database";
import type { ApiEntryMutationCommit } from "../../lib/api/mutationContext";
import { ApiRepository } from "../../lib/api/repository";
import { createCmsAuditEvent } from "../../lib/cms/services/accessPolicy";
import { buildEntryRevision } from "../../lib/cms/services/entries";
import { cmsCommitEntryMutation } from "../../lib/cms/storage/entryMutation";
import type { CmsStorageExecutor } from "../../lib/cms/storage/executor";
import type { AriaEntryRecord } from "../../lib/cms/schemas";

const userId = "10000000-0000-4000-8000-000000000001";
const credentialId = "20000000-0000-4000-8000-000000000001";
const siteId = "30000000-0000-4000-8000-000000000001";
const timestamp = "2026-07-19T00:00:00.000Z";

function executorFor(
  client: Client,
  batch?: CmsStorageExecutor["batch"],
): CmsStorageExecutor {
  return {
    async queryAll<T extends Record<string, unknown>>(sql: string, args = []) {
      return (await client.execute({ sql, args: args as InValue[] }))
        .rows as unknown as T[];
    },
    async queryFirst<T extends Record<string, unknown>>(
      sql: string,
      args = [],
    ) {
      return (
        ((await client.execute({ sql, args: args as InValue[] }))
          .rows[0] as unknown as T | undefined) ?? null
      );
    },
    async run(sql, args = []) {
      await client.execute({ sql, args: args as InValue[] });
    },
    batch:
      batch ??
      (async (statements) => {
        await client.batch(
          statements.map(
            (statement) =>
              ({
                sql: statement.sql,
                args: [...(statement.args ?? [])] as InValue[],
              }) satisfies InStatement,
          ),
          "write",
        );
      }),
  };
}

async function scalar(client: Client, sql: string): Promise<number> {
  const row = (await client.execute(sql)).rows[0];
  return Number(row?.value ?? 0);
}

describe("API mutation crash atomicity", () => {
  let client: Client;
  let repository: ApiRepository;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    for (const migration of [
      "0001_baseline_schema.sql",
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
    await client.execute({
      sql: `INSERT INTO aria_users (
        id, username, email, password_hash, role, created_at
      ) VALUES (?, 'atomic-user', 'atomic@example.test', 'not-used', 'administrator', ?)`,
      args: [userId, timestamp],
    });
    await client.execute({
      sql: `INSERT INTO aria_collections (
        id, name, label, kind, schema_json, scope, supports_json, created_at, updated_at
      ) VALUES ('posts', 'posts', 'Posts', 'content', ?, 'global', '[]', ?, ?)`,
      args: [
        JSON.stringify({
          id: "posts",
          label: "Posts",
          kind: "content",
          version: 1,
          fields: [],
        }),
        timestamp,
        timestamp,
      ],
    });
    repository = new ApiRepository(new LibSqlApiSqlDatabase(client));
    await repository.getOrCreateSiteIdentity(siteId, timestamp);
    await repository.insertCredential({
      id: credentialId,
      siteId,
      kind: "personal",
      principalId: userId,
      createdById: userId,
      name: "Atomicity",
      tokenPrefix: "atomicprefix1",
      tokenDigest: "digest-value-that-is-long-enough-for-schema-validation",
      keyId: "v1",
      scopes: ["entries:write"],
      expiresAt: null,
      now: timestamp,
    });
  });

  function record(version = "entry-version-1"): AriaEntryRecord {
    const actor = {
      id: userId,
      username: "atomic-user",
      email: "atomic@example.test",
    };
    return {
      entry: {
        id: "entry-1",
        collectionId: "posts",
        status: "draft",
        version,
        authorId: userId,
        createdAt: timestamp,
        updatedAt: timestamp,
        publishedAt: null,
        scheduledFor: null,
      },
      locales: [
        {
          entryId: "entry-1",
          collectionId: "posts",
          locale: "en",
          slug: "atomic-entry",
          title: "Atomic entry",
          frontmatter: {},
          body: null,
          isSource: true,
          commentsClosed: false,
        },
      ],
      relations: [],
      authorship: {
        author: actor,
        createdBy: actor,
        updatedBy: actor,
        publishedBy: null,
      },
    };
  }

  async function claim(
    options: {
      now?: string;
      leaseDurationMs?: number;
    } = {},
  ) {
    const result = await repository.claimIdempotency({
      credentialId,
      key: "atomic-idempotency-key-0001",
      method: "POST",
      routeTemplate: "/api/v1/collections/{collectionId}/entries",
      fingerprint: "atomic-fingerprint",
      now: options.now ?? timestamp,
      expiresAt: "2026-07-20T00:00:00.000Z",
      leaseDurationMs: options.leaseDurationMs,
    });
    if (result.kind !== "claimed")
      throw new Error(`Expected claim, got ${result.kind}`);
    return result;
  }

  function apiCommit(
    leaseToken: string,
    committedAt = "2026-07-19T00:00:01.000Z",
  ): ApiEntryMutationCommit {
    return {
      credentialId,
      key: "atomic-idempotency-key-0001",
      fingerprint: "atomic-fingerprint",
      leaseToken,
      committedAt,
      response: {
        status: 201,
        body: { success: true, data: record() },
        headers: {
          ETag: '"aria-entry-entry-version-1"',
          Location: "/api/v1/collections/posts/entries/entry-1",
        },
        resourceVersion: '"aria-entry-entry-version-1"',
      },
      securityAudit: {
        id: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        siteId,
        actorId: userId,
        credentialId,
        eventType: "mutation",
        method: "POST",
        routeTemplate: "/api/v1/collections/{collectionId}/entries",
        outcome: "success",
        metadataJson: JSON.stringify({ status: 201 }),
        createdAt: committedAt,
        expiresAt: "2026-10-17T00:00:01.000Z",
      },
    };
  }

  function mutationInput(api: ApiEntryMutationCommit) {
    const next = record();
    return {
      record: next,
      relations: next.relations,
      revision: buildEntryRevision(
        next,
        { id: userId, username: "atomic-user", email: "atomic@example.test" },
        "Created entry",
      ),
      auditEvent: createCmsAuditEvent({
        action: "entry.create",
        actorId: userId,
        actorUsername: "atomic-user",
        collectionId: "posts",
        entryId: "entry-1",
        summary: "Created CMS entry",
        metadata: {},
      }),
      api,
    };
  }

  async function expectNoMutation(): Promise<void> {
    await expect(
      scalar(client, "SELECT COUNT(*) AS value FROM aria_entries"),
    ).resolves.toBe(0);
    await expect(
      scalar(client, "SELECT COUNT(*) AS value FROM aria_entry_revisions"),
    ).resolves.toBe(0);
    await expect(
      scalar(client, "SELECT COUNT(*) AS value FROM aria_cms_audit_events"),
    ).resolves.toBe(0);
    await expect(
      scalar(client, "SELECT COUNT(*) AS value FROM aria_api_security_audit"),
    ).resolves.toBe(0);
  }

  it("rolls back every injected persistence-boundary crash, then commits once", async () => {
    const owned = await claim();
    const input = mutationInput(apiCommit(owned.leaseToken));
    let statementCount = 0;
    await expect(
      cmsCommitEntryMutation(
        executorFor(client, async (statements) => {
          statementCount = statements.length;
          throw new Error("crash-before-batch");
        }),
        input,
      ),
    ).rejects.toThrow("crash-before-batch");
    expect(statementCount).toBeGreaterThan(5);
    await expectNoMutation();

    for (let boundary = 1; boundary <= statementCount; boundary += 1) {
      await expect(
        cmsCommitEntryMutation(
          executorFor(client, async (statements) => {
            await client.batch(
              [
                ...statements.slice(0, boundary).map(
                  (statement) =>
                    ({
                      sql: statement.sql,
                      args: [...(statement.args ?? [])] as InValue[],
                    }) satisfies InStatement,
                ),
                {
                  sql: "INSERT INTO aria_fault_injection_missing_table (id) VALUES ('crash')",
                  args: [],
                },
              ],
              "write",
            );
          }),
          input,
        ),
      ).rejects.toThrow();
      await expectNoMutation();
    }

    await cmsCommitEntryMutation(executorFor(client), input);
    await expect(
      scalar(client, "SELECT COUNT(*) AS value FROM aria_entries"),
    ).resolves.toBe(1);
    await expect(
      scalar(client, "SELECT COUNT(*) AS value FROM aria_entry_revisions"),
    ).resolves.toBe(1);
    await expect(
      scalar(client, "SELECT COUNT(*) AS value FROM aria_cms_audit_events"),
    ).resolves.toBe(1);
    await expect(
      scalar(client, "SELECT COUNT(*) AS value FROM aria_api_security_audit"),
    ).resolves.toBe(1);
    await expect(
      repository.claimIdempotency({
        credentialId,
        key: "atomic-idempotency-key-0001",
        method: "POST",
        routeTemplate: "/api/v1/collections/{collectionId}/entries",
        fingerprint: "atomic-fingerprint",
        now: "2026-07-19T00:00:02.000Z",
        expiresAt: "2026-07-20T00:00:00.000Z",
      }),
    ).resolves.toMatchObject({ kind: "replay", response: { status: 201 } });
  });

  it("replays a commit when the worker crashes after the atomic batch returns", async () => {
    const owned = await claim();
    const input = mutationInput(apiCommit(owned.leaseToken));
    const base = executorFor(client);
    await expect(
      cmsCommitEntryMutation(
        executorFor(client, async (statements) => {
          await base.batch?.(statements);
          throw new Error("crash-after-commit");
        }),
        input,
      ),
    ).rejects.toThrow("crash-after-commit");

    const replay = await repository.claimIdempotency({
      credentialId,
      key: "atomic-idempotency-key-0001",
      method: "POST",
      routeTemplate: "/api/v1/collections/{collectionId}/entries",
      fingerprint: "atomic-fingerprint",
      now: "2026-07-19T00:00:02.000Z",
      expiresAt: "2026-07-20T00:00:00.000Z",
    });
    expect(replay).toMatchObject({ kind: "replay", response: { status: 201 } });
    await expect(
      scalar(client, "SELECT COUNT(*) AS value FROM aria_entries"),
    ).resolves.toBe(1);
    await expect(
      scalar(client, "SELECT COUNT(*) AS value FROM aria_entry_revisions"),
    ).resolves.toBe(1);
  });

  it("reclaims an expired pre-commit lease and fences the stale worker", async () => {
    const stale = await claim({ leaseDurationMs: 1_000 });
    const current = await claim({
      now: "2026-07-19T00:00:02.000Z",
      leaseDurationMs: 60_000,
    });
    expect(current.leaseToken).not.toBe(stale.leaseToken);

    await expect(
      cmsCommitEntryMutation(
        executorFor(client),
        mutationInput(apiCommit(stale.leaseToken, "2026-07-19T00:00:03.000Z")),
      ),
    ).rejects.toThrow("expected committed version");
    await expectNoMutation();

    await cmsCommitEntryMutation(
      executorFor(client),
      mutationInput(apiCommit(current.leaseToken, "2026-07-19T00:00:03.000Z")),
    );
    await expect(
      scalar(client, "SELECT COUNT(*) AS value FROM aria_entries"),
    ).resolves.toBe(1);
  });

  it("grants exactly one lease to concurrent duplicate requests", async () => {
    const base = {
      credentialId,
      key: "concurrent-idempotency-key-0001",
      method: "POST",
      routeTemplate: "/api/v1/collections/{collectionId}/entries",
      fingerprint: "concurrent-fingerprint",
      now: timestamp,
      expiresAt: "2026-07-20T00:00:00.000Z",
    };
    const claims = await Promise.all(
      Array.from({ length: 8 }, () => repository.claimIdempotency(base)),
    );
    expect(claims.filter((result) => result.kind === "claimed")).toHaveLength(
      1,
    );
    expect(
      claims.filter((result) => result.kind === "processing"),
    ).toHaveLength(7);
  });
});
