import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@libsql/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LibSqlApiSqlDatabase } from "../../lib/api/database";
import { ApiRepository } from "../../lib/api/repository";

vi.mock("../../actions/cms/collections", () => ({
  collections: {
    list: { handler: vi.fn() },
    get: { handler: vi.fn() },
  },
}));
vi.mock("../../actions/cms/entries", () => ({
  entries: {
    listCursor: { handler: vi.fn() },
    get: { handler: vi.fn() },
    create: { handler: vi.fn() },
    update: { handler: vi.fn() },
    publish: { handler: vi.fn() },
    unpublish: { handler: vi.fn() },
  },
}));
vi.mock("../../actions/cms/revisions", () => ({
  revisions: { restore: { handler: vi.fn() } },
}));
vi.mock("../../lib/api/auth", () => ({
  authenticateApiRequest: vi.fn(),
}));

import { entries } from "../../actions/cms/entries";
import { authenticateApiRequest } from "../../lib/api/auth";
import { handleGetEntry, handleUpdateEntry } from "../../lib/api/siteApi";

const mockedEntries = entries as unknown as {
  get: { handler: ReturnType<typeof vi.fn> };
  update: { handler: ReturnType<typeof vi.fn> };
};

const user = {
  id: "10000000-0000-4000-8000-000000000001",
  username: "route-user",
  email: "route@example.test",
  role: "administrator" as const,
  totpEnabled: false,
};

describe("site API route/action parity", () => {
  let repository: ApiRepository;
  let currentVersion: string;
  let getCalls: number;
  let updateCalls: number;

  beforeEach(async () => {
    vi.clearAllMocks();
    currentVersion = "v1";
    getCalls = 0;
    updateCalls = 0;
    const client = createClient({ url: ":memory:" });
    await client.executeMultiple(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE aria_users (id TEXT PRIMARY KEY);
    `);
    await client.execute({
      sql: "INSERT INTO aria_users (id) VALUES (?)",
      args: [user.id],
    });
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
    repository = new ApiRepository(new LibSqlApiSqlDatabase(client));
    const siteId = await repository.getOrCreateSiteIdentity();
    const credential = await repository.insertCredential({
      id: "20000000-0000-4000-8000-000000000001",
      siteId,
      kind: "personal",
      principalId: user.id,
      createdById: user.id,
      name: "Routes",
      tokenPrefix: "routeprefix1",
      tokenDigest: "digest-value-that-is-long-enough-for-schema-validation",
      keyId: "v1",
      scopes: ["entries:read", "entries:write"],
      expiresAt: null,
    });
    vi.mocked(authenticateApiRequest).mockResolvedValue({
      credential,
      user,
      siteId,
      repository,
      actionContext: {
        locals: { user },
        request: new Request("https://example.test/api"),
      } as never,
    });
    mockedEntries.get.handler.mockImplementation(
      async (_input: unknown, context: { locals: unknown }) => {
        getCalls += 1;
        expect((context.locals as { user?: typeof user }).user).toEqual(user);
        return { entry: { id: "one", version: currentVersion } };
      },
    );
    mockedEntries.update.handler.mockImplementation(async () => {
      updateCalls += 1;
      currentVersion = "v2";
      return { entry: { id: "one", version: currentVersion } };
    });
  });

  it("injects the credential principal and requires the route scope", async () => {
    const response = await handleGetEntry({
      request: new Request(
        "https://example.test/api/v1/collections/posts/entries/one",
      ),
      locals: {},
      params: { collectionId: "posts", entryId: "one" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("ETag")).toBe('"aria-entry-v1"');
    expect(vi.mocked(authenticateApiRequest)).toHaveBeenCalledWith(
      expect.objectContaining({ requiredScopes: ["entries:read"] }),
    );
    expect(getCalls).toBe(1);
  });

  it("replays a mutation before checking the now-stale precondition", async () => {
    const makeRequest = () =>
      new Request("https://example.test/api/v1/collections/posts/entries/one", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "route-idempotency-key-0001",
          "If-Match": '"aria-entry-v1"',
        },
        body: JSON.stringify({ title: "Updated" }),
      });
    const context = (request: Request) => ({
      request,
      locals: {},
      params: { collectionId: "posts", entryId: "one" },
    });
    const first = await handleUpdateEntry(context(makeRequest()));
    const replay = await handleUpdateEntry(context(makeRequest()));
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.headers.get("Idempotency-Replayed")).toBe("true");
    expect(getCalls).toBe(1);
    expect(updateCalls).toBe(1);
  });

  it("keeps status transitions on the dedicated publish routes", async () => {
    const response = await handleUpdateEntry({
      request: new Request(
        "https://example.test/api/v1/collections/posts/entries/one",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": "route-idempotency-key-0002",
            "If-Match": '"aria-entry-v1"',
          },
          body: JSON.stringify({ status: "published" }),
        },
      ),
      locals: {},
      params: { collectionId: "posts", entryId: "one" },
    });
    expect(response.status).toBe(422);
    expect(updateCalls).toBe(0);
  });

  it("maps a lost atomic version race to a replayable 412", async () => {
    mockedEntries.update.handler.mockImplementation(async () => {
      updateCalls += 1;
      currentVersion = "v2";
      throw new Error("Entry version conflict: expected v1, found v2");
    });
    const makeRequest = () =>
      new Request("https://example.test/api/v1/collections/posts/entries/one", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "route-idempotency-key-race-0001",
          "If-Match": '"aria-entry-v1"',
        },
        body: JSON.stringify({ title: "Raced update" }),
      });
    const routeContext = (request: Request) => ({
      request,
      locals: {},
      params: { collectionId: "posts", entryId: "one" },
    });

    const first = await handleUpdateEntry(routeContext(makeRequest()));
    const replay = await handleUpdateEntry(routeContext(makeRequest()));

    expect(first.status).toBe(412);
    expect(first.headers.get("ETag")).toBe('"aria-entry-v2"');
    expect(replay.status).toBe(412);
    expect(replay.headers.get("Idempotency-Replayed")).toBe("true");
    expect(updateCalls).toBe(1);
  });
});
