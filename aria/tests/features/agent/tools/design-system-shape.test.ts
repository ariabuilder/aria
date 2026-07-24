import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ariaSaveDesignSystemColors } from "../../../../admin/features/Agent/lib/tools/content/designSystemWriteTools";
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

const adminUser: SessionUser = {
  id: "550e8400-e29b-41d4-a716-446655440000",
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

describe("design system save input shape", () => {
  let storage: IsolatedSqliteStorage;

  beforeAll(async () => {
    storage = await createIsolatedSqliteStorage({ seedDesignSystem: true });
    storageOverride.adapter = storage.adapter;
  });

  afterAll(async () => {
    storageOverride.adapter = null;
    await storage.cleanup();
  });

  it("accepts palettes object copied from read output", async () => {
    const read = await ariaGetDesignSystem(createContext(), {
      detail: "summary",
    });
    if (!read.ok) {
      throw new Error(read.error.message);
    }

    const colors = read.data.colors as {
      activeTemplateId?: string;
      palettes?: Record<string, Record<string, string>>;
      semantic?: Record<string, string>;
    };

    const palettes = { ...colors.palettes };
    if (palettes.primary) {
      palettes.primary = {
        ...palettes.primary,
        500: "#ef4444",
        DEFAULT: "#ef4444",
      };
    }

    const result = await ariaSaveDesignSystemColors(createContext(), {
      colors: {
        templateId: colors.activeTemplateId ?? "custom",
        palettes,
        semantic: colors.semantic ?? {
          success: "#22c55e",
          warning: "#f59e0b",
          error: "#ef4444",
          info: "#3b82f6",
        },
      },
    });

    expect(result.ok, result.ok ? undefined : result.error.message).toBe(true);
  });
});
