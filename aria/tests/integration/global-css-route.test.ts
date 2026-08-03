import { beforeEach, describe, expect, it, vi } from "vitest";

const { getStorageAdapterAsyncMock } = vi.hoisted(() => ({
  getStorageAdapterAsyncMock: vi.fn(),
}));

vi.mock("../../../aria/lib/storage/getStorageAdapter", () => ({
  getStorageAdapterAsync: getStorageAdapterAsyncMock,
}));

describe("global CSS route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serves stored artifacts for preview requests without compiling content", async () => {
    const getDesignSystem = vi.fn(async () => ({
      artifacts: {
        globalCSS: "body{margin:0}.grid{display:grid}",
        globalCSSHash: "stored-global-hash",
      },
    }));
    getStorageAdapterAsyncMock.mockResolvedValue({ getDesignSystem });

    const { GET } = await import("../../../src/pages/styles/global.css");
    const response = await GET({
      locals: {},
      request: new Request("https://example.com/styles/global.css?preview=1"),
    } as never);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("body{margin:0}.grid{display:grid}");
    expect(response.headers.get("Cache-Control")).toBe(
      "no-store, must-revalidate",
    );
    expect(getDesignSystem).toHaveBeenCalledOnce();
  });

  it("only marks a URL immutable when its version matches the stored hash", async () => {
    getStorageAdapterAsyncMock.mockResolvedValue({
      getDesignSystem: vi.fn(async () => ({
        artifacts: {
          globalCSS: "body{margin:0}",
          globalCSSHash: "stored-global-hash",
        },
      })),
    });

    const { GET } = await import("../../../src/pages/styles/global.css");
    const unversioned = await GET({
      locals: {},
      request: new Request("https://example.com/styles/global.css"),
    } as never);
    const matching = await GET({
      locals: {},
      request: new Request(
        "https://example.com/styles/global.css?v=stored-global-hash",
      ),
    } as never);

    expect(unversioned.headers.get("Cache-Control")).toBe(
      "no-cache, must-revalidate",
    );
    expect(matching.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  it("preserves cache policy on matching ETag responses", async () => {
    getStorageAdapterAsyncMock.mockResolvedValue({
      getDesignSystem: vi.fn(async () => ({
        artifacts: {
          globalCSS: "body{margin:0}",
          globalCSSHash: "stored-global-hash",
        },
      })),
    });

    const { GET } = await import("../../../src/pages/styles/global.css");
    const response = await GET({
      locals: {},
      request: new Request(
        "https://example.com/styles/global.css?v=stored-global-hash",
        { headers: { "If-None-Match": '"stored-global-hash"' } },
      ),
    } as never);

    expect(response.status).toBe(304);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
  });
});
