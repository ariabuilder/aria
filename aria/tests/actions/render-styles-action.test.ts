import { beforeEach, describe, expect, it, vi } from "vitest";

import { getActionHandler } from "../helpers/actionHandler";
import { createDefaultUniversalDesignSystem } from "../../lib/styles/universalDesignSystem";

const { getStorageAdapterAsyncMock, requireAuthMock } = vi.hoisted(() => ({
  getStorageAdapterAsyncMock: vi.fn(),
  requireAuthMock: vi.fn(),
}));

vi.mock("../../lib/storage/getStorageAdapter", () => ({
  getStorageAdapterAsync: getStorageAdapterAsyncMock,
}));

vi.mock("../../actions/_shared", () => ({
  requireAuth: requireAuthMock,
}));

describe("getRenderStyles action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue({ id: "admin" });
  });

  it("builds a cache miss from persisted artifacts without scanning content", async () => {
    const designSystem = createDefaultUniversalDesignSystem();
    designSystem.artifacts.baseCSS = "body{margin:0}";
    designSystem.artifacts.baseCSSHash = "base-hash";
    designSystem.artifacts.utilityCSS = ".grid{display:grid}";
    designSystem.artifacts.utilityCSSHash = "utility-hash";
    designSystem.artifacts.customClassesCSS = ".card{padding:1rem}";
    designSystem.artifacts.customFontsCSS = "";
    designSystem.artifacts.globalCSS =
      "body{margin:0}.grid{display:grid}.card{padding:1rem}";
    designSystem.artifacts.globalCSSHash = "global-hash";
    designSystem.artifacts.lastCompiled = "2026-08-02T22:15:18.510Z";

    const adapter = {
      getSiteSettings: vi.fn(async () => ({
        styleRevision: "style-1",
        utilityEngine: "unocss",
      })),
      getDesignSystemSegments: vi.fn(async () => designSystem),
      getDesignSystem: vi.fn(async () => designSystem),
      getContentSiteState: vi.fn(() => {
        throw new Error("content revision must not participate in style reads");
      }),
      listPagesDSL: vi.fn(() => {
        throw new Error("page scan must not run");
      }),
      listLayoutsDSL: vi.fn(() => {
        throw new Error("layout scan must not run");
      }),
      listComponentsDSL: vi.fn(() => {
        throw new Error("component scan must not run");
      }),
    };
    const cache = {
      get: vi.fn(async () => null),
      put: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    };
    getStorageAdapterAsyncMock.mockResolvedValue(adapter);

    const { getRenderStylesAction } = await import(
      "../../actions/styles/renderStyles"
    );
    const result = await getActionHandler(getRenderStylesAction)(undefined, {
      locals: { cfBindings: { aria_cache: cache } },
    } as never);

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        globalCSS: designSystem.artifacts.globalCSS,
        globalCSSHash: "global-hash",
        utilityCSS: ".grid{display:grid}",
        styleRevision: "style-1",
        utilityEngine: "unocss",
      }),
    });
    expect(adapter.getDesignSystemSegments).toHaveBeenCalledOnce();
    expect(adapter.getDesignSystem).not.toHaveBeenCalled();
    expect(adapter.getContentSiteState).not.toHaveBeenCalled();
    expect(adapter.listPagesDSL).not.toHaveBeenCalled();
    expect(adapter.listLayoutsDSL).not.toHaveBeenCalled();
    expect(adapter.listComponentsDSL).not.toHaveBeenCalled();
    expect(cache.put).toHaveBeenCalledWith(
      "render-styles:v3:style-1:stored-artifacts",
      expect.any(String),
      { expirationTtl: 86_400 },
    );
  });
});
