import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ariaGetDesignSystem } from "../../../../admin/features/Agent/lib/tools/content/readTools";
import type { AgentToolActionContext } from "../../../../admin/features/Agent/lib/tools/types";
import type { SessionUser } from "../../../../lib/auth/types";
import type { StorageAdapter } from "../../../../lib/storage/adapter";
import {
  createIsolatedSqliteStorage,
  type IsolatedSqliteStorage,
} from "../../../helpers/isolatedSqliteStorage";

const storageOverride = vi.hoisted(() => ({
  adapter: null as StorageAdapter | null,
}));

vi.mock("../../../../lib/storage/getStorageAdapter", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../../lib/storage/getStorageAdapter")
    >();
  return {
    ...actual,
    getStorageAdapterAsync: vi.fn(async () => {
      if (!storageOverride.adapter) {
        throw new Error("Isolated test storage is not initialized");
      }
      return storageOverride.adapter;
    }),
  };
});

const TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440000";

const adminUser: SessionUser = {
  id: TEST_USER_ID,
  username: "admin",
  email: "admin@example.com",
  role: "administrator",
  totpEnabled: false,
  preferences: {},
};

vi.mock("../../../../lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/auth")>();
  return {
    ...actual,
    requireAuth: vi.fn(async () => adminUser),
    requireOperation: vi.fn(async () => adminUser),
  };
});

function createContext(): AgentToolActionContext {
  return {
    locals: {} as App.Locals,
    request: new Request("https://aria.test/admin"),
    user: adminUser,
  };
}

describe("ariaGetDesignSystem", () => {
  let storage: IsolatedSqliteStorage;

  beforeAll(async () => {
    storage = await createIsolatedSqliteStorage({ seedDesignSystem: true });
    storageOverride.adapter = storage.adapter;
  });

  afterAll(async () => {
    storageOverride.adapter = null;
    await storage.cleanup();
  });

  it("returns a creation-ready visual summary from sqlite storage", async () => {
    const result = await ariaGetDesignSystem(createContext(), {
      detail: "summary",
    });
    expect(result.ok, result.ok ? undefined : result.error.message).toBe(true);
    if (result.ok) {
      expect(result.data.colors).toBeTruthy();
      expect(result.data.typography).toMatchObject({
        families: {
          body: expect.any(String),
          heading: expect.any(String),
        },
        scale: expect.arrayContaining([
          expect.objectContaining({ id: "base", size: expect.any(Number) }),
        ]),
      });
      expect(result.data.globalStyles).toHaveProperty("defaults.section");
      expect(result.data.breakpoints).toEqual(expect.any(Array));
    }
  });

  it("returns full design system payload", async () => {
    const result = await ariaGetDesignSystem(createContext(), {
      detail: "full",
    });
    expect(result.ok, result.ok ? undefined : result.error.message).toBe(true);
    if (result.ok) {
      expect(result.data.colors).toBeTruthy();
      expect(result.data.globalStyles).toBeTruthy();
      expect(result.data.breakpoints).toBeTruthy();
      expect(result.data.revision).toEqual(expect.any(String));
      expect(result.data.colors).toMatchObject({
        templateId: expect.any(String),
        palettes: expect.any(Array),
        semantic: expect.any(Object),
      });
      expect(result.data.typography).toMatchObject({
        families: {
          body: expect.any(String),
          heading: expect.any(String),
          mono: expect.any(String),
        },
        scale: expect.arrayContaining([
          expect.objectContaining({
            id: "base",
            size: expect.any(Number),
            lineHeight: expect.any(Number),
            letterSpacing: expect.any(Number),
          }),
        ]),
      });
      expect(result.data.typography).not.toHaveProperty("sizes");
    }
  });
});
