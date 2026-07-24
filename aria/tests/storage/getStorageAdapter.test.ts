import { afterEach, describe, expect, it, vi } from "vitest";
import type { AriaCloudflareEnv, RuntimeLocals } from "../../lib/cloudflare/env";

function createWorkerBindings(
  overrides: Partial<AriaCloudflareEnv> = {},
): AriaCloudflareEnv {
  return {
    aria_db: {} as D1Database,
    aria_cache: {
      get: vi.fn(async () => null),
      put: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    },
    aria_r2: {} as R2Bucket,
    ...overrides,
  };
}

function createWorkerLocals(
  overrides: Partial<AriaCloudflareEnv> = {},
): RuntimeLocals {
  return { cfBindings: createWorkerBindings(overrides) };
}

const STORAGE_ENV_KEYS = [
  "ARIA_STORAGE_BACKEND",
  "ARIA_STORAGE",
  "ARIA_FORCE_CLOUDFLARE",
] as const;

function resetStorageEnv(): void {
  for (const key of STORAGE_ENV_KEYS) {
    delete process.env[key];
  }
}

async function loadStorageModule(cloudflareEnv: Record<string, unknown> = {}) {
  vi.resetModules();

  vi.doMock("cloudflare:workers", () => ({
    env: cloudflareEnv,
  }));

  vi.doMock("../../lib/storage/sqlite", () => ({
    SQLiteStorageAdapter: class MockSQLiteStorageAdapter {
      readonly backend = "sqlite";
    },
  }));

  vi.doMock("../../lib/storage/cloudflare", () => ({
    CloudflareStorageAdapter: class MockCloudflareStorageAdapter {
      readonly backend = "cloudflare";

      constructor(readonly env: Record<string, unknown>) {}
    },
  }));

  return import("../../lib/storage/getStorageAdapter");
}

describe("getStorageAdapterAsync", () => {
  afterEach(() => {
    resetStorageEnv();
    vi.resetModules();
    vi.doUnmock("../../lib/storage/sqlite");
    vi.doUnmock("../../lib/storage/cloudflare");
  });

  it("defaults local execution to the SQLite adapter", async () => {
    const { clearStorageAdapterCache, getStorageAdapterAsync } =
      await loadStorageModule();

    clearStorageAdapterCache();

    const adapter = await getStorageAdapterAsync();

    expect(adapter).toMatchObject({ backend: "sqlite" });
  });

  it("still honors an explicit Cloudflare selection", async () => {
    process.env.ARIA_STORAGE_BACKEND = "cloudflare";

    const bindings = createWorkerBindings({
      ARIA_STORAGE_BACKEND: "cloudflare",
    });

    const { clearStorageAdapterCache, getStorageAdapterAsync } =
      await loadStorageModule(bindings);

    clearStorageAdapterCache();

    const adapter = await getStorageAdapterAsync(createWorkerLocals({
      ARIA_STORAGE_BACKEND: "cloudflare",
    }));

    expect(adapter).toMatchObject({ backend: "cloudflare" });
  });

  it("defaults to Cloudflare storage when workerd bindings are present", async () => {
    const bindings = createWorkerBindings();

    const { clearStorageAdapterCache, getStorageAdapterAsync } =
      await loadStorageModule(bindings);

    clearStorageAdapterCache();

    const adapter = await getStorageAdapterAsync(createWorkerLocals());

    expect(adapter).toMatchObject({
      backend: "cloudflare",
      env: {
        mirrorMediaLocally: false,
      },
    });
  });

  it("rejects explicit SQLite when worker bindings are present", async () => {
    process.env.ARIA_STORAGE_BACKEND = "sqlite";

    const bindings = createWorkerBindings();

    const { clearStorageAdapterCache, getStorageAdapterAsync } =
      await loadStorageModule(bindings);

    clearStorageAdapterCache();

    await expect(getStorageAdapterAsync(createWorkerLocals())).rejects.toThrow(
      /Local SQLite storage is not supported/,
    );
  });

  it("honors explicit SQLite when no worker bindings exist", async () => {
    process.env.ARIA_STORAGE_BACKEND = "sqlite";

    const { clearStorageAdapterCache, getStorageAdapterAsync } =
      await loadStorageModule({});

    clearStorageAdapterCache();

    const adapter = await getStorageAdapterAsync();

    expect(adapter).toMatchObject({ backend: "sqlite" });
  });
});
