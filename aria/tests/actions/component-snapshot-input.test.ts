import { describe, expect, it, vi } from "vitest";

import { buildComponentSnapshotInput } from "../../actions/_componentSnapshotInput";
import type { StorageAdapter } from "../../lib/storage/adapter";

const getDesignSystemMock = vi.hoisted(() => vi.fn());
const buildGeneratedDocumentCssMock = vi.hoisted(() => vi.fn());
const buildStoredRenderStylesDataMock = vi.hoisted(() => vi.fn());
const buildStageRenderStylesDataMock = vi.hoisted(() => vi.fn());

vi.mock("../../actions/_designSystemPersist", () => ({
  getDesignSystem: getDesignSystemMock,
}));

vi.mock("../../actions/styles", () => ({
  buildGeneratedDocumentCss: buildGeneratedDocumentCssMock,
  buildStoredRenderStylesData: buildStoredRenderStylesDataMock,
  buildStageRenderStylesData: buildStageRenderStylesDataMock,
}));

describe("buildComponentSnapshotInput", () => {
  it("returns null when the component does not exist", async () => {
    const adapter = {
      getComponentDSL: vi.fn().mockResolvedValue(null),
    } as unknown as StorageAdapter;

    await expect(
      buildComponentSnapshotInput("missing", adapter),
    ).resolves.toBeNull();
  });

  it("builds snapshot input with resolved render styles", async () => {
    getDesignSystemMock.mockResolvedValue({ breakpoints: [] });
    buildGeneratedDocumentCssMock.mockResolvedValue("generated-css");
    buildStoredRenderStylesDataMock.mockReturnValue({
      globalCSS: "stored-global",
      baseCSS: "stored-base",
      utilityCSS: "stored-utility",
    });
    buildStageRenderStylesDataMock.mockReturnValue({
      globalCSS: "stage-global",
      baseCSS: "stage-base",
      utilityCSS: "stage-utility",
    });

    const adapter = {
      getComponentDSL: vi.fn().mockResolvedValue({
        id: "hero-cta",
        nodes: [{ id: "node-1", type: "text" }],
        settings: { cssVariables: { "--brand": "#000" } },
      }),
      getSiteSettings: vi.fn().mockResolvedValue({ theme: "light" }),
    } as unknown as StorageAdapter;

    const snapshotInput = await buildComponentSnapshotInput("hero-cta", adapter);

    expect(snapshotInput).toEqual({
      componentId: "hero-cta",
      componentUpdatedAt: null,
      nodes: [{ id: "node-1", type: "text" }],
      settings: { theme: "light" },
      renderStyles: {
        globalCSS: "stage-global",
        baseCSS: "stage-base",
        utilityCSS: "stage-utility",
      },
      pageCssVariables: { "--brand": "#000" },
    });
    expect(buildGeneratedDocumentCssMock).toHaveBeenCalled();
  });
});
