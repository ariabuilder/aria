import { computed, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listInstalledMock,
  catalogMock,
  packMock,
  installPackMock,
  uninstallPackMock,
  installComponentMock,
  loggerMock,
} = vi.hoisted(() => ({
  listInstalledMock: vi.fn(),
  catalogMock: vi.fn(),
  packMock: vi.fn(),
  installPackMock: vi.fn(),
  uninstallPackMock: vi.fn(),
  installComponentMock: vi.fn(),
  loggerMock: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    library: {
      listInstalled: (...args: unknown[]) => listInstalledMock(...args),
      catalog: (...args: unknown[]) => catalogMock(...args),
      pack: (...args: unknown[]) => packMock(...args),
      installPack: (...args: unknown[]) => installPackMock(...args),
      uninstallPack: (...args: unknown[]) => uninstallPackMock(...args),
      installComponent: (...args: unknown[]) => installComponentMock(...args),
    },
  },
}));

vi.mock("@/lib/utils/logger", () => ({
  log: (...args: unknown[]) => loggerMock(...args),
}));

function createOptions() {
  return {
    searchQuery: ref(""),
    refreshComponents: vi.fn(async () => undefined),
    duplicateComponent: vi.fn(async () => null),
    components: computed(() => []),
  };
}

function createPack() {
  return {
    id: "starter-pack",
    name: "Starter Pack",
    version: "1.2.0",
    tier: "free" as const,
    componentIds: ["aria-hero"],
    publishedAt: "2026-03-27T10:00:00.000Z",
    installState: "not_installed" as const,
    installedComponentCount: 0,
    installed: false,
    updateAvailable: false,
  };
}

describe("useStudioLibrary", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    listInstalledMock.mockResolvedValue({
      data: {
        success: true,
        data: [],
      },
      error: null,
    });
    packMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          manifest: {
            id: "starter-pack",
            name: "Starter Pack",
            version: "1.2.0",
            tier: "free",
            componentIds: ["aria-hero"],
            publishedAt: "2026-03-27T10:00:00.000Z",
          },
          components: [],
        },
      },
      error: null,
    });
  });

  it("rejects malformed catalog responses before mutating library state", async () => {
    const { useStudioLibrary } =
      await import("../../admin/features/Studio/composer/composables/useStudioLibrary");

    catalogMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          registryVersion: "1",
          updatedAt: "2026-03-27T10:00:00.000Z",
          packs: [{ id: "starter-pack", name: "Starter Pack" }],
        },
      },
      error: null,
    });

    const options = createOptions();
    const library = useStudioLibrary(options);

    await library.loadLibraryCatalog();

    expect(library.libraryCatalog.value).toEqual([]);
    expect(library.libraryError.value).toBe("Failed to load Aria Library");
    expect(packMock).not.toHaveBeenCalled();
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[StudioLibrary] Invalid library catalog response",
      expect.objectContaining({
        source: "useStudioLibrary.loadLibraryCatalog",
        issues: expect.any(Array),
      }),
    );
  });

  it("does not refresh components when the install pack response is malformed", async () => {
    const { useStudioLibrary } =
      await import("../../admin/features/Studio/composer/composables/useStudioLibrary");

    installPackMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          packId: "starter-pack",
          version: "1.2.0",
          componentCount: "bad",
          componentIds: ["aria-hero"],
        },
      },
      error: null,
    });

    const options = createOptions();
    const library = useStudioLibrary(options);
    const pack = createPack();

    await library.installLibraryPack(pack);

    expect(installPackMock).toHaveBeenCalledWith({
      packId: "starter-pack",
      version: "1.2.0",
      force: false,
    });
    expect(library.libraryActionError.value).toBe(
      "Failed to install Starter Pack",
    );
    expect(options.refreshComponents).not.toHaveBeenCalled();
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[StudioLibrary] Invalid install pack response",
      expect.objectContaining({
        source: "useStudioLibrary.installLibraryPack",
        packId: "starter-pack",
        issues: expect.any(Array),
      }),
    );
  });

  it("keeps selected pack components empty when the pack details response is malformed", async () => {
    const { useStudioLibrary } =
      await import("../../admin/features/Studio/composer/composables/useStudioLibrary");

    catalogMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          registryVersion: "1",
          updatedAt: "2026-03-27T10:00:00.000Z",
          packs: [createPack()],
        },
      },
      error: null,
    });
    packMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          manifest: {
            id: "starter-pack",
            name: "Starter Pack",
            version: "1.2.0",
            tier: "free",
            componentIds: ["aria-hero"],
            publishedAt: "2026-03-27T10:00:00.000Z",
          },
          components: [{ id: "aria-hero", name: 42 }],
        },
      },
      error: null,
    });

    const library = useStudioLibrary(createOptions());

    await library.loadLibraryCatalog();

    expect(library.selectedLibraryPackComponents.value).toEqual([]);
    expect(library.selectedLibraryPackError.value).toBe(
      "Failed to load Starter Pack",
    );
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[StudioLibrary] Invalid pack details response",
      expect.objectContaining({
        source: "useStudioLibrary.loadSelectedLibraryPack",
        packId: "starter-pack",
        issues: expect.any(Array),
      }),
    );
  });
});
