import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getStorageAdapterAsyncMock,
  getSessionIdFromCookiesMock,
  getAuthAdapterAsyncMock,
  readSessionUserFromLocalsMock,
} = vi.hoisted(() => ({
  getStorageAdapterAsyncMock: vi.fn(),
  getSessionIdFromCookiesMock: vi.fn(),
  getAuthAdapterAsyncMock: vi.fn(),
  readSessionUserFromLocalsMock: vi.fn(),
}));

vi.mock("../../../aria/lib/storage/getStorageAdapter", () => ({
  getStorageAdapterAsync: (...args: unknown[]) =>
    getStorageAdapterAsyncMock(...args),
}));

vi.mock("../../../aria/lib/auth", () => ({
  getAuthAdapterAsync: (...args: unknown[]) => getAuthAdapterAsyncMock(...args),
  getSessionIdFromCookies: (...args: unknown[]) =>
    getSessionIdFromCookiesMock(...args),
}));

vi.mock("../../../aria/lib/runtime/requestLocals", () => ({
  readSessionUserFromLocals: (...args: unknown[]) =>
    readSessionUserFromLocalsMock(...args),
}));

describe("component thumbnail route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getSessionIdFromCookiesMock.mockReturnValue(null);
    readSessionUserFromLocalsMock.mockReturnValue({
      id: "123e4567-e89b-12d3-a456-426614174000",
      username: "andy",
      email: "andy@example.com",
      role: "admin",
      totpEnabled: false,
    });
  });

  it("serves thumbnail bytes through the storage adapter", async () => {
    getStorageAdapterAsyncMock.mockResolvedValue({
      readThumbnail: vi.fn().mockResolvedValue({
        buffer: Buffer.from("component-thumb"),
        contentType: "image/png",
      }),
    });

    const { GET } = await import(
      "../../../src/pages/admin/api/component-thumbnails/[id].ts"
    );

    const response = await GET({
      params: { id: "hero-cta" },
      locals: {},
      cookies: { get: vi.fn() },
      request: new Request(
        "https://app.example.com/admin/api/component-thumbnails/hero-cta",
      ),
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    await expect(response.text()).resolves.toBe("component-thumb");
  });
});
