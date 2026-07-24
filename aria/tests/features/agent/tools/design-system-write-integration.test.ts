import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  ariaApplyDesignSystemTemplate,
  ariaSaveDesignSystemColors,
  ariaSetDesignSystemPrimaryColor,
} from "../../../../admin/features/Agent/lib/tools/content/designSystemWriteTools";
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

describe("design system write integration", () => {
  let storage: IsolatedSqliteStorage;

  beforeAll(async () => {
    storage = await createIsolatedSqliteStorage({ seedDesignSystem: true });
    storageOverride.adapter = storage.adapter;
  });

  afterAll(async () => {
    storageOverride.adapter = null;
    await storage.cleanup();
  });

  it("applies a palette template through the tool handler", async () => {
    const result = await ariaApplyDesignSystemTemplate(createContext(), {
      templateId: "minimal",
    });
    if (!result.ok) {
      console.log("apply template error:", result.error);
    }
    expect(result.ok).toBe(true);
  });

  it("saves colors after reading the current design system", async () => {
    const read = await ariaGetDesignSystem(createContext(), { detail: "full" });
    expect(read.ok).toBe(true);
    if (!read.ok) {
      return;
    }

    const colors = read.data.colors as {
      templateId?: string;
      palettes: Array<{
        name: string;
        label?: string;
        shades: Record<string, string>;
      }>;
      paletteAliases?: Record<string, string>;
      semantic: {
        success: string;
        warning: string;
        error: string;
        info: string;
      };
    };

    expect(read.data.revision).toEqual(expect.any(String));
    const palettes = colors.palettes.map((palette) => ({
      ...palette,
      shades:
        palette.name === "primary"
          ? { ...palette.shades, 500: "#ff0000" }
          : palette.shades,
    }));

    const save = await ariaSaveDesignSystemColors(createContext(), {
      colors: {
        templateId: colors.templateId ?? "custom",
        palettes,
        paletteAliases: colors.paletteAliases,
        semantic: colors.semantic,
      },
    });

    if (!save.ok) {
      console.log("save colors error:", save.error);
    }
    expect(save.ok).toBe(true);
  });

  it("sets primary color via convenience tool", async () => {
    const result = await ariaSetDesignSystemPrimaryColor(createContext(), {
      color: "red",
    });
    if (!result.ok) {
      console.log("set primary error:", result.error);
    }
    expect(result.ok).toBe(true);
  });
});
