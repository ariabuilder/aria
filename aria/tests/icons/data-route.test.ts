import { beforeEach, describe, expect, it, vi } from "vitest";

const mockResolveIconData = vi.fn();

vi.mock("../../../src/lib/icons/resolve", () => ({
  resolveIconData: mockResolveIconData,
}));

describe("GET /api/icons/data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveIconData.mockResolvedValue({
      icons: {},
      missing: [],
      snapshotVersion: "test-snapshot",
    });
  });

  it("returns 400 when ids query param is missing", async () => {
    const { GET } = await import("../../../src/pages/api/icons/data");

    const response = await GET({
      url: new URL("https://aria.test/api/icons/data"),
      locals: {},
    } as never);

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toBe("Invalid data params");
  });

  it("returns 400 when unique ids exceed the route batch limit", async () => {
    const ids = Array.from(
      { length: 11 },
      (_, index) => `lucide:icon-${index}`,
    ).join(",");

    const { GET } = await import("../../../src/pages/api/icons/data");

    const response = await GET({
      url: new URL(
        `https://aria.test/api/icons/data?ids=${encodeURIComponent(ids)}`,
      ),
      locals: {},
    } as never);

    expect(response.status).toBe(400);
  });

  it("deduplicates ids before resolving icon data", async () => {
    mockResolveIconData.mockResolvedValue({
      icons: {},
      missing: [],
      snapshotVersion: "test-snapshot",
    });

    const { GET } = await import("../../../src/pages/api/icons/data");

    const response = await GET({
      url: new URL(
        "https://aria.test/api/icons/data?ids=lucide:star,lucide:star,lucide:heart",
      ),
      locals: {},
    } as never);

    expect(response.status).toBe(200);
    expect(mockResolveIconData).toHaveBeenCalledWith({
      ids: ["lucide:star", "lucide:heart"],
      locals: {},
    });
  });

  it("forwards only valid canonical IDs and reports invalid IDs as missing", async () => {
    mockResolveIconData.mockResolvedValue({
      icons: {
        "lucide:star": {
          svg: "<svg />",
          viewBox: "0 0 24 24",
          snapshotVersion: "2026-02-25-snapshot",
        },
      },
      missing: ["lucide:brain"],
      snapshotVersion: "test-snapshot",
    });

    const { GET } = await import("../../../src/pages/api/icons/data");

    const response = await GET({
      url: new URL(
        "https://aria.test/api/icons/data?ids=lucide:star,invalid-id,lucide:brain",
      ),
      locals: { session: "x" },
    } as never);

    expect(response.status).toBe(200);
    expect(mockResolveIconData).toHaveBeenCalledWith({
      ids: ["lucide:star", "lucide:brain"],
      locals: { session: "x" },
    });

    const payload = (await response.json()) as {
      missing: string[];
      icons: Record<string, unknown>;
    };

    expect(payload.icons["lucide:star"]).toBeDefined();
    expect(payload.missing).toContain("lucide:brain");
    expect(payload.missing).toContain("invalid-id");
    expect((payload as { snapshotVersion?: string }).snapshotVersion).toBe(
      "test-snapshot",
    );
  });

  it("returns 500 when resolver fails", async () => {
    mockResolveIconData.mockRejectedValue(new Error("resolver failed"));

    const { GET } = await import("../../../src/pages/api/icons/data");

    const response = await GET({
      url: new URL(
        "https://aria.test/api/icons/data?ids=lucide:star",
      ),
      locals: {},
    } as never);

    expect(response.status).toBe(500);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toBe("Failed to resolve icons");
  });
});
