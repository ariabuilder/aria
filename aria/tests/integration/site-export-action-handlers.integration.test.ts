import { actionsSharedMocks } from "../mocks/actions-shared-state";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultUniversalDesignSystem } from "../../lib/styles/universalDesignSystem";
import {
  createActionsSharedAuthMockModule,
  createTestSessionUser,
  resetActionsSharedAuthMocks,
} from "../mocks/actions-shared";
import {
  createActionContext,
  invokeActionHandler,
  type ActionWithHandler,
} from "../helpers/actionHandlers";

const mockCleanupExpired = vi.fn();
const mockSave = vi.fn();
const mockGetDesignSystem = vi.fn();
const mockGenerateSiteExportArchive = vi.fn();

vi.mock("../../lib/storage/getStorageAdapter", () => ({
  getStorageAdapterAsync: vi.fn(async () => ({})),
}));

vi.mock("../../actions/_shared", () =>
  createActionsSharedAuthMockModule(actionsSharedMocks),
);

vi.mock("../../actions/_designSystemPersist", () => ({
  getDesignSystem: mockGetDesignSystem,
}));

vi.mock("../../lib/export/storage", () => ({
  createSiteExportStore: vi.fn(() => ({
    cleanupExpired: mockCleanupExpired,
    save: mockSave,
  })),
  buildSiteExportRecord: vi.fn((input) => ({
    ...input,
    artifactKey: "exports/test.zip",
    metadataKey: "exports/test.json",
    downloadPath: "/api/site-exports/test",
  })),
}));

vi.mock("../../lib/export/generator", () => ({
  generateSiteExportArchive: mockGenerateSiteExportArchive,
}));

describe("site export action handlers integration", () => {
  beforeEach(() => {
    resetActionsSharedAuthMocks(actionsSharedMocks, {
      user: createTestSessionUser({
        id: "f1b18110-3ef0-4f86-9a8d-9ca4fe3064d8",
        username: "andy",
      }),
    });

    const designSystem = createDefaultUniversalDesignSystem();
    designSystem.artifacts.compiledUnoCSS = ".hero{display:grid}";
    designSystem.artifacts.globalCSS = ".hero{display:grid}";
    designSystem.artifacts.globalCSSHash = "hash-123";
    designSystem.artifacts.unocssClasses = ["hero"];
    designSystem.artifacts.lastCompiled = "2026-03-26T00:00:00.000Z";

    mockCleanupExpired.mockResolvedValue(undefined);
    mockSave.mockResolvedValue(undefined);
    mockGetDesignSystem.mockResolvedValue(designSystem);
    mockGenerateSiteExportArchive.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      filename: "aria-site-export-test.zip",
      pageCount: 2,
      mediaCount: 1,
    });
  });

  it("loads stored design system artifacts before building site exports", async () => {
    const { siteExport } = await import("../../actions/site-export");

    const result = await invokeActionHandler(
      siteExport.create as unknown as ActionWithHandler<
        { ttlMinutes: number },
        { export?: { filename: string } | null }
      >,
      { ttlMinutes: 15 },
      createActionContext(),
    );

    expect(result.export?.filename).toBe("aria-site-export-test.zip");
    expect(actionsSharedMocks.requireOperation).toHaveBeenCalledWith(
      expect.anything(),
      "siteExport.create",
    );
    expect(mockGetDesignSystem).toHaveBeenCalledTimes(1);
    expect(mockGenerateSiteExportArchive).toHaveBeenCalledWith(expect.objectContaining({
      adapter: expect.any(Object),
      designSystemOverride: expect.objectContaining({
        artifacts: expect.objectContaining({
          globalCSSHash: "hash-123",
        }),
      }),
    }));
  });

  it("uses stored design system artifacts for custom utility-engine exports too", async () => {
    const { siteExport } = await import("../../actions/site-export");

    const result = await invokeActionHandler(
      siteExport.create as unknown as ActionWithHandler<
        { ttlMinutes: number },
        { export?: { filename: string } | null }
      >,
      { ttlMinutes: 15 },
      createActionContext(),
    );

    expect(result.export?.filename).toBe("aria-site-export-test.zip");
    expect(mockGetDesignSystem).toHaveBeenCalledTimes(1);
    expect(mockGenerateSiteExportArchive).toHaveBeenCalledWith(expect.objectContaining({
      adapter: expect.any(Object),
      designSystemOverride: expect.objectContaining({
        artifacts: expect.objectContaining({
          globalCSSHash: "hash-123",
        }),
      }),
    }));
  });
});
