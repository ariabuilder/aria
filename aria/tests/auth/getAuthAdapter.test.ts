import { afterEach, describe, expect, it, vi } from "vitest";

const AUTH_ENV_KEYS = ["ARIA_AUTH_BACKEND", "ARIA_FORCE_CLOUDFLARE"] as const;

function resetAuthEnv(): void {
  for (const key of AUTH_ENV_KEYS) {
    delete process.env[key];
  }
}

async function loadAuthModule(cloudflareEnv: Record<string, unknown> = {}) {
  vi.resetModules();

  vi.doMock("cloudflare:workers", () => ({
    env: cloudflareEnv,
  }));

  vi.doMock("drizzle-orm/d1", () => ({
    drizzle: () => ({ backend: "d1-db" }),
  }));

  vi.doMock("drizzle-orm/libsql", () => ({
    drizzle: () => ({ backend: "libsql-db" }),
  }));

  vi.doMock("@libsql/client", () => ({
    createClient: () => ({ backend: "libsql-client" }),
  }));

  vi.doMock("../../lib/auth/schema", () => ({}));

  vi.doMock("../../lib/auth/cloudflare-adapter", () => ({
    CloudflareAdapter: class MockCloudflareAdapter {
      readonly backend = "cloudflare";

      constructor(
        readonly db: Record<string, unknown>,
        readonly kv: Record<string, unknown>,
      ) {}

      async initialize() {}
    },
  }));

  vi.doMock("../../lib/auth/libsql-adapter", () => ({
    LibSQLAdapter: class MockLibsqlAdapter {
      readonly backend = "libsql";

      constructor(
        readonly db: Record<string, unknown>,
        readonly client: Record<string, unknown>,
      ) {}

      async initialize() {}
    },
  }));

  return import("../../lib/auth/getAuthAdapter");
}

describe("getAuthAdapterAsync", () => {
  afterEach(() => {
    resetAuthEnv();
    vi.resetModules();
  });

  it("defaults local execution to the LibSQL adapter", async () => {
    const { clearAuthAdapterCache, getAuthAdapterAsync } =
      await loadAuthModule();

    clearAuthAdapterCache();

    const adapter = await getAuthAdapterAsync();

    expect(adapter).toMatchObject({ backend: "libsql" });
  });

  it("defaults to the Cloudflare adapter when workerd bindings are present", async () => {
    const bindings = {
      aria_db: { binding: "db" },
      session: { binding: "session-kv" },
    };
    const { clearAuthAdapterCache, getAuthAdapterAsync } =
      await loadAuthModule(bindings);

    clearAuthAdapterCache();

    const locals = { cfBindings: bindings } as unknown as import("../../lib/auth/getAuthAdapter").RuntimeLocals;
    const adapter = await getAuthAdapterAsync(locals);

    expect(adapter).toMatchObject({ backend: "cloudflare" });
  });

  it("rejects explicit local auth override when workerd bindings are present", async () => {
    process.env.ARIA_AUTH_BACKEND = "local-libsql";

    const bindings = {
      aria_db: { binding: "db" },
      session: { binding: "session-kv" },
    };
    const { clearAuthAdapterCache, getAuthAdapterAsync } =
      await loadAuthModule(bindings);

    clearAuthAdapterCache();

    const locals = { cfBindings: bindings } as unknown as import("../../lib/auth/getAuthAdapter").RuntimeLocals;
    await expect(getAuthAdapterAsync(locals)).rejects.toThrow(
      "Local SQLite auth is not supported under Astro 6 Cloudflare/workerd dev.",
    );
  });
});
