import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BuilderNode } from "../../lib/types/nodes";

const mockGetSiteSettings = vi.fn();
const mockSaveSiteSettings = vi.fn();
const mockGetPageDSL = vi.fn();
const mockGetPageVersionPins = vi.fn();
const mockSavePageDSL = vi.fn();
const mockTouchContentRevision = vi.fn();
const mockValidateAndConsumeNonce = vi.fn();

vi.mock("../../lib/storage/getStorageAdapter", () => ({
  getStorageAdapterAsync: vi.fn(async () => ({
    getSiteSettings: mockGetSiteSettings,
    saveSiteSettings: mockSaveSiteSettings,
    getPageDSL: mockGetPageDSL,
    savePageDSL: mockSavePageDSL,
    touchContentRevision: mockTouchContentRevision,
  })),
}));

vi.mock("../../actions/_shared", () => ({
  generateNonce: vi.fn(() => "nonce-next"),
  getAdapter: vi.fn(async () => ({
    getPageVersionPins: mockGetPageVersionPins,
  })),
  getResource: vi.fn(async (_adapter, collection: string, id: string) => {
    if (collection === "pages") {
      return mockGetPageDSL(id);
    }
    throw new Error(`Unsupported collection ${collection}`);
  }),
  invalidateComposeCache: vi.fn(async () => undefined),
  invalidateDependentPageCaches: vi.fn(async () => undefined),
  requireAuth: vi.fn(async () => undefined),
  resolveAuthorizedMutation: vi.fn(async () => ({
    authorship: { authorId: "test-user", source: "test" },
  })),
  saveResource: vi.fn(
    async (
      _adapter,
      _context,
      collection: string,
      id: string,
      resource: unknown,
    ) => {
      if (collection === "pages") {
        return mockSavePageDSL(id, resource);
      }
      throw new Error(`Unsupported collection ${collection}`);
    },
  ),
  storeNonce: vi.fn(async () => undefined),
}));

vi.mock("../../lib/cache/service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../lib/cache/service")>();

  return {
    ...actual,
    invalidateComposeCache: vi.fn(async () => undefined),
    syncPageComponentDependencies: vi.fn(async () => undefined),
    validateAndConsumeNonce: mockValidateAndConsumeNonce,
  };
});

vi.mock("../../lib/rendering/pageSnapshots", () => ({
  savePageSnapshot: vi.fn(async () => undefined),
}));

function createNode(overrides: Partial<BuilderNode>): BuilderNode {
  return {
    id: overrides.id ?? "node",
    type: overrides.type ?? "icon",
    props: overrides.props ?? {},
    styles: overrides.styles ?? {},
    children: overrides.children ?? [],
    ...overrides,
  };
}

describe("icon action handlers integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetSiteSettings.mockResolvedValue({
      icons: {
        enabledPacks: {
          lucide: true,
          "coreui-brands": true,
        },
        defaultPack: "lucide",
      },
    });

    mockSaveSiteSettings.mockResolvedValue(undefined);

    mockGetPageDSL.mockResolvedValue({
      id: "home",
      slug: "home",
      title: "Home",
      nodes: [],
      layout: "default",
    });
    mockGetPageVersionPins.mockResolvedValue(null);

    mockSavePageDSL.mockResolvedValue("v-next");
    mockTouchContentRevision.mockResolvedValue(undefined);
    mockValidateAndConsumeNonce.mockResolvedValue({ valid: true });
  });

  it("settings.updateIcons normalizes and persists icon settings", async () => {
    const { settings } = await import("../../actions/settings");

    const result = await (settings.updateIcons as any).handler(
      {
        enabledPacks: {
          lucide: false,
          "coreui-brands": true,
        },
        defaultPack: "coreui-brands",
      },
      { locals: {} } as never,
    );

    expect(result.success).toBe(true);
    expect(mockSaveSiteSettings).toHaveBeenCalledTimes(1);

    const saved = mockSaveSiteSettings.mock.calls[0]?.[0] as {
      icons?: {
        enabledPacks: Record<string, boolean>;
        defaultPack: string;
      };
    };

    expect(saved.icons?.enabledPacks.lucide).toBe(false);
    expect(saved.icons?.enabledPacks["coreui-brands"]).toBe(true);
    expect(saved.icons?.defaultPack).toBe("coreui-brands");
  });

  it("settings.updateIcons rejects disabled default pack", async () => {
    const { settings } = await import("../../actions/settings");

    const result = await (settings.updateIcons as any).handler(
      {
        enabledPacks: {
          lucide: false,
          "coreui-brands": true,
        },
        defaultPack: "lucide",
      },
      { locals: {} } as never,
    );

    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.error.code).toBe("UPDATE_ICONS_FAILED");
    }
    expect(mockSaveSiteSettings).not.toHaveBeenCalled();
  });

  it("save.page normalizes legacy icon classes to canonical objects before persistence", async () => {
    const { save } = await import("../../actions/save");

    const blocks = [
      createNode({
        id: "icon-1",
        type: "icon",
        props: {
          icon: "i-lucide:star",
        },
      }),
    ];

    const result = await (save.page as any).handler(
      {
        id: "home",
        blocks,
        layout: "default",
      },
      { locals: {} } as never,
    );

    expect(result.version).toBe("v-next");
    expect(mockSavePageDSL).toHaveBeenCalledTimes(1);

    const savedPage = mockSavePageDSL.mock.calls[0]?.[1] as {
      nodes: BuilderNode[];
    };

    const iconValue = savedPage.nodes[0]?.props?.icon as Record<
      string,
      unknown
    >;
    expect(iconValue.id).toBe("lucide:star");
    expect(iconValue.pack).toBe("lucide");
    expect(iconValue.name).toBe("star");
  });

  it("save.page rejects invalid icon payload shape", async () => {
    const { save } = await import("../../actions/save");

    const blocks = [
      createNode({
        id: "icon-invalid",
        type: "icon",
        props: {
          icon: {
            id: "not-canonical",
            pack: "lucide",
          },
        },
      }),
    ];

    const request = (save.page as any).handler(
      {
        id: "home",
        blocks,
        layout: "default",
      },
      { locals: {} } as never,
    );
    await expect(request).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "RENDER_INPUT_INVALID: The render input is invalid.",
    });
    await expect(request).rejects.not.toHaveProperty("context");
    await expect(request).rejects.not.toThrow("icon-invalid");

    expect(mockSavePageDSL).not.toHaveBeenCalled();
  });

  it("save.page rejects nonce-less blank overwrites for non-empty pages", async () => {
    const { save } = await import("../../actions/save");

    mockGetPageDSL.mockResolvedValue({
      id: "home",
      slug: "home",
      title: "Home",
      nodes: [createNode({ id: "hero", type: "text" })],
      layout: "default",
    });

    await expect(
      (save.page as any).handler(
        {
          id: "home",
          blocks: [],
          layout: "default",
        },
        { locals: {} } as never,
      ),
    ).rejects.toThrow("savePage:home failed");

    expect(mockValidateAndConsumeNonce).not.toHaveBeenCalled();
    expect(mockSavePageDSL).not.toHaveBeenCalled();
  });

  it("nodes.mutate normalizes legacy icon class to canonical object", async () => {
    const { nodes } = await import("../../actions/nodes");

    mockGetPageDSL.mockResolvedValue({
      id: "home",
      slug: "home",
      title: "Home",
      nodes: [
        createNode({
          id: "icon-node",
          type: "icon",
          props: {
            icon: "i-lucide:camera",
          },
        }),
      ],
      layout: "default",
    });

    const result = await (nodes.mutate as any).handler(
      {
        collection: "pages",
        id: "home",
        nodeId: "icon-node",
        updates: {
          props: {
            icon: "i-lucide:star",
          },
        },
        breakpoint: "base",
      },
      { locals: {} } as never,
    );

    expect(result.version).toBe("v-next");
    expect(mockSavePageDSL).toHaveBeenCalledTimes(1);

    const savedPage = mockSavePageDSL.mock.calls[0]?.[1] as {
      nodes: BuilderNode[];
    };
    const mutatedIcon = savedPage.nodes[0]?.props?.icon as Record<
      string,
      unknown
    >;

    expect(mutatedIcon.id).toBe("lucide:star");
    expect(mutatedIcon.pack).toBe("lucide");
    expect(mutatedIcon.name).toBe("star");
  });

  it("nodes.mutate removes cleared responsive style breakpoints", async () => {
    const { nodes } = await import("../../actions/nodes");

    mockGetPageDSL.mockResolvedValue({
      id: "home",
      slug: "home",
      title: "Home",
      nodes: [
        createNode({
          id: "text-node",
          type: "text",
          styles: {
            fontFamily: {
              base: "Inter",
              tablet: "Roboto",
            },
          },
        }),
      ],
      layout: "default",
    });

    const result = await (nodes.mutate as any).handler(
      {
        collection: "pages",
        id: "home",
        nodeId: "text-node",
        updates: {
          styles: {
            fontFamily: {
              tablet: undefined,
            },
          },
        },
        breakpoint: "tablet",
      },
      { locals: {} } as never,
    );

    expect(result.version).toBe("v-next");

    const savedPage = mockSavePageDSL.mock.calls[0]?.[1] as {
      nodes: BuilderNode[];
    };

    expect(savedPage.nodes[0]?.styles?.fontFamily).toEqual({
      base: "Inter",
    });
  });

  it("nodes.insertNode normalizes inserted icon payload", async () => {
    const { nodes } = await import("../../actions/nodes");

    mockGetPageDSL.mockResolvedValue({
      id: "home",
      slug: "home",
      title: "Home",
      nodes: [],
      layout: "default",
    });

    const result = await (nodes.insertNode as any).handler(
      {
        collection: "pages",
        id: "home",
        parentId: null,
        node: {
          id: "inserted-icon",
          type: "icon",
          props: {
            icon: "i-lucide:brain",
          },
          styles: {},
          children: [],
        },
        position: 0,
      },
      { locals: {} } as never,
    );

    expect(result.version).toBe("v-next");
    expect(result.nodeId).toBe("inserted-icon");

    const savedPage = mockSavePageDSL.mock.calls[0]?.[1] as {
      nodes: BuilderNode[];
    };
    const insertedIcon = savedPage.nodes[0]?.props?.icon as Record<
      string,
      unknown
    >;

    expect(insertedIcon.id).toBe("lucide:brain");
    expect(insertedIcon.pack).toBe("lucide");
  });

  it("nodes.insertNode rejects invalid icon payload", async () => {
    const { nodes } = await import("../../actions/nodes");

    mockGetPageDSL.mockResolvedValue({
      id: "home",
      slug: "home",
      title: "Home",
      nodes: [],
      layout: "default",
    });

    await expect(
      (nodes.insertNode as any).handler(
        {
          collection: "pages",
          id: "home",
          parentId: null,
          node: {
            id: "inserted-invalid",
            type: "icon",
            props: {
              icon: {
                id: "broken",
                pack: "lucide",
              },
            },
            styles: {},
            children: [],
          },
          position: 0,
        },
        { locals: {} } as never,
      ),
    ).rejects.toThrow("Invalid icon payload for node inserted-invalid");

    expect(mockSavePageDSL).not.toHaveBeenCalled();
  });

  it("nodes.mutate rejects invalid icon payload", async () => {
    const { nodes } = await import("../../actions/nodes");

    mockGetPageDSL.mockResolvedValue({
      id: "home",
      slug: "home",
      title: "Home",
      nodes: [
        createNode({
          id: "icon-node",
          type: "icon",
          props: {
            icon: "i-lucide:star",
          },
        }),
      ],
      layout: "default",
    });

    await expect(
      (nodes.mutate as any).handler(
        {
          collection: "pages",
          id: "home",
          nodeId: "icon-node",
          updates: {
            props: {
              icon: {
                id: "invalid",
                pack: "lucide",
              },
            },
          },
          breakpoint: "base",
        },
        { locals: {} } as never,
      ),
    ).rejects.toThrow("Invalid icon payload for node icon-node");

    expect(mockSavePageDSL).not.toHaveBeenCalled();
  });
});
