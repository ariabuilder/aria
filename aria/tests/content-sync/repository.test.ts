import {
  createClient,
  type Client,
  type InValue,
} from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

import { ContentSyncRepository } from "../../lib/content-sync/service/repository";

type RepositoryDatabase = NonNullable<
  ConstructorParameters<typeof ContentSyncRepository>[1]
>;
type RepositoryStatement = ReturnType<RepositoryDatabase["prepare"]>;

function toLibsqlValues(values: readonly unknown[]): InValue[] {
  return values.map((value): InValue => {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "bigint" ||
      typeof value === "boolean" ||
      value instanceof Uint8Array ||
      value instanceof Date
    ) {
      return value;
    }

    throw new TypeError("Unsupported content-sync SQL argument.");
  });
}

function createSqlDatabase(client: Client): RepositoryDatabase {
  const createStatement = (
    sql: string,
    boundArgs: InValue[] = [],
  ): RepositoryStatement => ({
    bind(...values: unknown[]) {
      return createStatement(sql, toLibsqlValues(values));
    },
    async first<T = unknown>() {
      const result = await client.execute({ sql, args: boundArgs });
      return ((result.rows[0] as unknown as T | undefined) ?? null) as T | null;
    },
    async all<T = unknown>() {
      const result = await client.execute({ sql, args: boundArgs });
      return {
        results: result.rows as unknown as T[],
      };
    },
    async run() {
      return client.execute({ sql, args: boundArgs });
    },
  });

  return {
    prepare(sql: string) {
      return createStatement(sql);
    },
  };
}

describe("ContentSyncRepository", () => {
  let client: Client;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aria-content-sync-"));
    client = createClient({ url: `file:${path.join(tempDir, "aria.db")}` });
  });

  afterEach(async () => {
    client.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("persists dry-run jobs and items on a sqlite-like backend", async () => {
    const repository = new ContentSyncRepository(
      undefined,
      createSqlDatabase(client),
    );

    await repository.createDryRunJob({
      id: "plan-1",
      direction: "push",
      sourceEndpointId: "local-sqlite",
      targetEndpointId: "cloudflare-d1",
      conflictPolicy: "newest-wins",
      localRevisionId: "local-rev-1",
      remoteRevisionId: "remote-rev-1",
      summary: {
        total: 1,
        created: 0,
        updated: 1,
        deleted: 0,
        skipped: 0,
        conflicted: 0,
        failed: 0,
      },
      createdBy: "tester",
      createdAt: "2026-03-16T12:00:00.000Z",
      items: [
        {
          id: "item-1",
          resourceType: "page",
          resourceId: "home",
          resourceLabel: "Home",
          action: "update",
          localVersion: "v2",
          remoteVersion: "v1",
          resultStatus: "planned",
        },
      ],
    });

    const job = await repository.getJobById("plan-1");
    const items = await repository.listItemsByJobId("plan-1");
    const history = await repository.getHistoryJobsWithItems({ limit: 10 });

    expect(job).toMatchObject({
      id: "plan-1",
      mode: "dry-run",
      status: "completed",
      sourceEndpointId: "local-sqlite",
      targetEndpointId: "cloudflare-d1",
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      jobId: "plan-1",
      resourceType: "page",
      resourceId: "home",
      resultStatus: "planned",
    });
    expect(history[0]?.items).toHaveLength(1);
    expect(await repository.countJobsByMode("dry-run")).toBe(1);
  });

  it("uses the D1 binding path for apply jobs and sync anchors", async () => {
    const bindingName: string = "aria_db";
    const repository = new ContentSyncRepository({
      cfBindings: {
        [bindingName]: createSqlDatabase(client),
      },
    });

    await repository.createDryRunJob({
      id: "plan-1",
      direction: "pull",
      sourceEndpointId: "cloudflare-d1",
      targetEndpointId: "local-sqlite",
      conflictPolicy: "newest-wins",
      localRevisionId: "local-rev-1",
      remoteRevisionId: "remote-rev-2",
      summary: {
        total: 0,
        created: 0,
        updated: 0,
        deleted: 0,
        skipped: 0,
        conflicted: 0,
        failed: 0,
      },
      createdBy: "tester",
      createdAt: "2026-03-16T12:09:00.000Z",
      items: [],
    });

    await repository.createApplyJob({
      id: "apply-1",
      planJobId: "plan-1",
      direction: "pull",
      sourceEndpointId: "cloudflare-d1",
      targetEndpointId: "local-sqlite",
      conflictPolicy: "newest-wins",
      localRevisionId: "local-rev-1",
      remoteRevisionId: "remote-rev-2",
      createdBy: "tester",
      createdAt: "2026-03-16T12:10:00.000Z",
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    });

    await repository.completeApplyJob({
      jobId: "apply-1",
      status: "completed",
      summary: {
        total: 2,
        created: 1,
        updated: 1,
        deleted: 0,
        skipped: 0,
        conflicted: 0,
        failed: 0,
      },
      finishedAt: "2026-03-16T12:15:00.000Z",
      resultLocalRevisionId: "local-rev-2",
      resultRemoteRevisionId: "remote-rev-2",
    });

    const job = await repository.getApplyJobByIdempotencyKey(
      "11111111-1111-4111-8111-111111111111",
    );
    const latestApply = await repository.getLatestApplyJob();
    const anchor = await repository.getLatestSuccessfulSyncAnchor();

    expect(job).toMatchObject({
      id: "apply-1",
      mode: "apply",
      status: "completed",
    });
    expect(latestApply?.id).toBe("apply-1");
    expect(anchor).toMatchObject({
      jobId: "apply-1",
      direction: "pull",
      localRevisionId: "local-rev-2",
      remoteRevisionId: "remote-rev-2",
    });
  });

  it("reconciles stale running apply jobs as failed", async () => {
    const repository = new ContentSyncRepository(
      undefined,
      createSqlDatabase(client),
    );

    await repository.createDryRunJob({
      id: "plan-1",
      direction: "push",
      sourceEndpointId: "local-sqlite",
      targetEndpointId: "cloudflare-d1",
      conflictPolicy: "newest-wins",
      localRevisionId: "local-rev-1",
      remoteRevisionId: "remote-rev-1",
      summary: {
        total: 0,
        created: 0,
        updated: 0,
        deleted: 0,
        skipped: 0,
        conflicted: 0,
        failed: 0,
      },
      createdBy: "tester",
      createdAt: "2026-03-16T12:00:00.000Z",
      items: [],
    });

    await repository.createApplyJob({
      id: "apply-stale-1",
      planJobId: "plan-1",
      direction: "push",
      sourceEndpointId: "local-sqlite",
      targetEndpointId: "cloudflare-d1",
      conflictPolicy: "newest-wins",
      localRevisionId: "local-rev-1",
      remoteRevisionId: "remote-rev-1",
      createdBy: "tester",
      createdAt: "2026-03-16T12:01:00.000Z",
      idempotencyKey: "22222222-2222-4222-8222-222222222222",
    });

    const reconciled = await repository.reconcileStaleApplyJobs({
      staleBefore: "2026-03-16T12:03:00.000Z",
      finishedAt: "2026-03-16T12:05:00.000Z",
      notes: "Recovered stale apply during test.",
    });

    const job = await repository.getJobById("apply-stale-1");

    expect(reconciled).toBe(1);
    expect(job).toMatchObject({
      id: "apply-stale-1",
      mode: "apply",
      status: "failed",
      finishedAt: "2026-03-16T12:05:00.000Z",
      summary: {
        total: 1,
        created: 0,
        updated: 0,
        deleted: 0,
        skipped: 0,
        conflicted: 0,
        failed: 1,
      },
      notes: "Recovered stale apply during test.",
    });
  });
});
