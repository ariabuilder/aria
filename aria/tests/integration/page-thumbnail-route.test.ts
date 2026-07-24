import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getStorageAdapterAsyncMock,
  getSessionIdFromCookiesMock,
  getAuthAdapterAsyncMock,
  readSessionUserFromLocalsMock,
  hasEffectiveCapabilityMock,
} = vi.hoisted(() => ({
  getStorageAdapterAsyncMock: vi.fn(),
  getSessionIdFromCookiesMock: vi.fn(),
  getAuthAdapterAsyncMock: vi.fn(),
  readSessionUserFromLocalsMock: vi.fn(),
  hasEffectiveCapabilityMock: vi.fn(),
}));

vi.mock("../../../aria/lib/storage/getStorageAdapter", () => ({
  getStorageAdapterAsync: (...args: unknown[]) =>
    getStorageAdapterAsyncMock(...args),
}));

vi.mock("../../../aria/lib/auth", () => ({
  getAuthAdapterAsync: (...args: unknown[]) => getAuthAdapterAsyncMock(...args),
  hasEffectiveCapability: (...args: unknown[]) =>
    hasEffectiveCapabilityMock(...args),
  getSessionIdFromCookies: (...args: unknown[]) =>
    getSessionIdFromCookiesMock(...args),
}));

vi.mock("../../../aria/lib/runtime/requestLocals", () => ({
  readSessionUserFromLocals: (...args: unknown[]) =>
    readSessionUserFromLocalsMock(...args),
}));

describe("page thumbnail route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getSessionIdFromCookiesMock.mockReturnValue(null);
    readSessionUserFromLocalsMock.mockReturnValue(null);
    hasEffectiveCapabilityMock.mockImplementation((user, capability) => {
      if (user?.role === "admin" || user?.role === "administrator") {
        return true;
      }
      return Boolean(user?.capabilities?.includes(capability));
    });
  });

  it("returns 401 when the request is not authenticated", async () => {
    const { GET } =
      await import("../../../src/pages/admin/api/page-thumbnails/[pageId].ts");

    const response = await GET({
      params: { pageId: "home" },
      locals: {},
      cookies: { get: vi.fn() },
      request: new Request(
        "https://app.example.com/admin/api/page-thumbnails/home?stage=draft",
      ),
    } as never);

    expect(response.status).toBe(401);
  });

  it("returns 403 before reading thumbnails when the user lacks page access", async () => {
    const readPageThumbnailMock = vi.fn();
    readSessionUserFromLocalsMock.mockReturnValue({
      id: "123e4567-e89b-12d3-a456-426614174000",
      username: "reader",
      email: "reader@example.com",
      role: "contributor",
      totpEnabled: false,
      capabilities: [],
    });
    getStorageAdapterAsyncMock.mockResolvedValue({
      readPageThumbnail: readPageThumbnailMock,
    });

    const { GET } =
      await import("../../../src/pages/admin/api/page-thumbnails/[pageId].ts");

    const response = await GET({
      params: { pageId: "about" },
      locals: {},
      cookies: { get: vi.fn() },
      request: new Request(
        "https://app.example.com/admin/api/page-thumbnails/about?stage=draft",
      ),
    } as never);

    expect(response.status).toBe(403);
    expect(readPageThumbnailMock).not.toHaveBeenCalled();
  });

  it("returns private thumbnail bytes for the authenticated page and stage", async () => {
    const readPageThumbnailMock = vi.fn().mockResolvedValue({
      buffer: Buffer.from("webp-bytes"),
      contentType: "image/webp",
    });

    readSessionUserFromLocalsMock.mockReturnValue({
      id: "123e4567-e89b-12d3-a456-426614174000",
      username: "andy",
      email: "andy@example.com",
      role: "admin",
      totpEnabled: false,
    });
    getStorageAdapterAsyncMock.mockResolvedValue({
      readPageThumbnail: readPageThumbnailMock,
    });

    const { GET } =
      await import("../../../src/pages/admin/api/page-thumbnails/[pageId].ts");

    const response = await GET({
      params: { pageId: "about" },
      locals: {},
      cookies: { get: vi.fn() },
      request: new Request(
        "https://app.example.com/admin/api/page-thumbnails/about?stage=published",
      ),
    } as never);

    expect(readPageThumbnailMock).toHaveBeenCalledWith("about", "published");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(response.headers.get("Cache-Control")).toBe(
      "private, max-age=31536000, immutable",
    );
    await expect(response.text()).resolves.toBe("webp-bytes");
  });

  it("allows review-capable users to read draft thumbnail bytes", async () => {
    const readPageThumbnailMock = vi.fn().mockResolvedValue({
      buffer: Buffer.from("review-thumb"),
      contentType: "image/webp",
    });

    readSessionUserFromLocalsMock.mockReturnValue({
      id: "123e4567-e89b-12d3-a456-426614174000",
      username: "reviewer",
      email: "reviewer@example.com",
      role: "contributor",
      totpEnabled: false,
      capabilities: ["reviewContent"],
    });
    getStorageAdapterAsyncMock.mockResolvedValue({
      readPageThumbnail: readPageThumbnailMock,
    });

    const { GET } =
      await import("../../../src/pages/admin/api/page-thumbnails/[pageId].ts");

    const response = await GET({
      params: { pageId: "about" },
      locals: {},
      cookies: { get: vi.fn() },
      request: new Request(
        "https://app.example.com/admin/api/page-thumbnails/about?stage=draft",
      ),
    } as never);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("review-thumb");
  });

});
