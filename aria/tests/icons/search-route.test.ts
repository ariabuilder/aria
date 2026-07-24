import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSiteSettings = vi.fn();
const mockSearchIcons = vi.fn();

vi.mock("../../lib/storage/getStorageAdapter", () => ({
  getStorageAdapterAsync: vi.fn(async () => ({
    getSiteSettings: mockGetSiteSettings,
  })),
}));

vi.mock("../../../src/lib/icons/resolve", () => ({
  searchIcons: mockSearchIcons,
}));

describe("GET /api/icons/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSiteSettings.mockResolvedValue({
      icons: {
        enabledPacks: {
          lucide: true,
          "coreui-brands": true,
        },
      },
    });
    mockSearchIcons.mockResolvedValue({
      items: [],
      nextCursor: null,
      snapshotVersion: "2026-02-25-snapshot",
    });
  });

  it("returns 400 for invalid pack", async () => {
    const { GET } = await import("../../../src/pages/api/icons/search");

    const response = await GET({
      url: new URL("https://aria.test/api/icons/search?pack=invalid"),
      locals: {},
    } as never);

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toBe("Invalid search params");
  });

  it("returns 403 when requested pack is disabled", async () => {
    mockGetSiteSettings.mockResolvedValue({
      icons: {
        enabledPacks: {
          lucide: false,
          "coreui-brands": true,
        },
      },
    });

    const { GET } = await import("../../../src/pages/api/icons/search");

    const response = await GET({
      url: new URL("https://aria.test/api/icons/search?pack=lucide&q=star"),
      locals: {},
    } as never);

    expect(response.status).toBe(403);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toBe("Pack disabled for this project");
  });

  it("returns 200 and forwards parsed params to resolver", async () => {
    mockSearchIcons.mockResolvedValue({
      items: [
        {
          id: "lucide:star",
          pack: "lucide",
          name: "star",
          label: "Star",
          tags: [],
        },
      ],
      nextCursor: "next-cursor",
      snapshotVersion: "2026-02-25-snapshot",
    });

    const { GET } = await import("../../../src/pages/api/icons/search");

    const response = await GET({
      url: new URL(
        "https://aria.test/api/icons/search?pack=lucide&q=star&limit=50&cursor=abc",
      ),
      locals: { tenant: "test" },
    } as never);

    expect(response.status).toBe(200);
    expect(mockSearchIcons).toHaveBeenCalledWith({
      pack: "lucide",
      q: "star",
      limit: 50,
      cursor: "abc",
      locals: { tenant: "test" },
    });

    const payload = (await response.json()) as {
      items: Array<{ id: string }>;
      nextCursor: string | null;
    };
    expect(payload.items).toHaveLength(1);
    expect(payload.nextCursor).toBe("next-cursor");
  });

  it("falls back to all packs enabled when icon settings are malformed", async () => {
    mockGetSiteSettings.mockResolvedValue({
      icons: {
        enabledPacks: {
          lucide: "yes",
        },
      },
    });

    const { GET } = await import("../../../src/pages/api/icons/search");

    const response = await GET({
      url: new URL("https://aria.test/api/icons/search?pack=lucide&q=star"),
      locals: {},
    } as never);

    expect(response.status).toBe(200);
    expect(mockSearchIcons).toHaveBeenCalledWith(
      expect.objectContaining({
        pack: "lucide",
      }),
    );
  });

  it("returns 500 when resolver throws", async () => {
    mockSearchIcons.mockRejectedValue(new Error("upstream unavailable"));

    const { GET } = await import("../../../src/pages/api/icons/search");

    const response = await GET({
      url: new URL("https://aria.test/api/icons/search?pack=lucide&q=star"),
      locals: {},
    } as never);

    expect(response.status).toBe(500);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toBe("Failed to search icons");
  });
});
