import { beforeEach, describe, expect, it, vi } from "vitest";
import { ICON_SNAPSHOT_VERSION } from "../../../aria/lib/icons/generatedIconSnapshot";

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
  getSessionIdFromCookies: (...args: unknown[]) =>
    getSessionIdFromCookiesMock(...args),
  hasEffectiveCapability: (...args: unknown[]) =>
    hasEffectiveCapabilityMock(...args),
}));

vi.mock("../../../aria/lib/runtime/requestLocals", () => ({
  readSessionUserFromLocals: (...args: unknown[]) =>
    readSessionUserFromLocalsMock(...args),
}));

const SNAPSHOT_HTML =
  `<!-- aria-component-snapshot:v1 -->\n<!-- aria-component-snapshot:icon-snapshot:${ICON_SNAPSHOT_VERSION} -->\n<!-- aria-component-snapshot:style-revision:style-1 -->\n<!-- aria-component-snapshot:component-updated:2026-06-29T00:00:00.000Z -->\n<html><body><div data-aria-component-preview-root>component</div></body></html>`;

describe("component snapshot route authorization", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getSessionIdFromCookiesMock.mockReturnValue(null);
    readSessionUserFromLocalsMock.mockReturnValue(null);
    hasEffectiveCapabilityMock.mockImplementation((user, capability) => {
      if (user?.role === "administrator") return true;
      return Boolean(user?.capabilities?.includes(capability));
    });
  });

  it("returns 401 when unauthenticated", async () => {
    const { GET } = await import(
      "../../../src/pages/admin/api/component-snapshots/[id].ts"
    );

    const response = await GET({
      params: { id: "hero" },
      locals: {},
      cookies: { get: vi.fn() },
      request: new Request(
        "https://app.example.com/admin/api/component-snapshots/hero",
      ),
    } as never);

    expect(response.status).toBe(401);
  });

  it("returns 403 before storage when the user cannot edit page content", async () => {
    readSessionUserFromLocalsMock.mockReturnValue({
      id: "123e4567-e89b-12d3-a456-426614174000",
      username: "viewer",
      role: "contributor",
      totpEnabled: false,
      capabilities: ["reviewContent"],
    });

    const { GET } = await import(
      "../../../src/pages/admin/api/component-snapshots/[id].ts"
    );

    const response = await GET({
      params: { id: "hero" },
      locals: {},
      cookies: { get: vi.fn() },
      request: new Request(
        "https://app.example.com/admin/api/component-snapshots/hero",
      ),
    } as never);

    expect(response.status).toBe(403);
    expect(getStorageAdapterAsyncMock).not.toHaveBeenCalled();
  });

  it("allows page editors to read cached component snapshots", async () => {
    readSessionUserFromLocalsMock.mockReturnValue({
      id: "123e4567-e89b-12d3-a456-426614174000",
      username: "editor",
      role: "contributor",
      totpEnabled: false,
      capabilities: ["editPageContent"],
    });
    getStorageAdapterAsyncMock.mockResolvedValue({
      getSiteSettings: vi.fn().mockResolvedValue({ styleRevision: "style-1" }),
      getComponentDSL: vi.fn().mockResolvedValue({
        id: "hero",
        updatedAt: "2026-06-29T00:00:00.000Z",
      }),
      getSnapshot: vi.fn().mockResolvedValue(SNAPSHOT_HTML),
    });

    const { GET } = await import(
      "../../../src/pages/admin/api/component-snapshots/[id].ts"
    );

    const response = await GET({
      params: { id: "hero" },
      locals: {},
      cookies: { get: vi.fn() },
      request: new Request(
        "https://app.example.com/admin/api/component-snapshots/hero",
      ),
    } as never);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("component");
  });
});
