import { describe, expect, it, vi } from "vitest";

import { buildComponentSnapshotInput } from "../../actions/_componentSnapshotInput";
import type { SiteSettings } from "../../lib/storage/adapter";
import type { ComponentDSL } from "../../lib/types/nodes";

type SnapshotAdapter = Parameters<typeof buildComponentSnapshotInput>[1];

function createAdapter(
  component: ComponentDSL | null,
  siteSettings: SiteSettings | null = null,
): SnapshotAdapter {
  return {
    getComponentDSL: vi.fn(async () => component),
    getSiteSettings: vi.fn(async () => siteSettings),
    getDesignSystem: vi.fn(async () => null),
    listPagesDSL: vi.fn(async () => []),
    listLayoutsDSL: vi.fn(async () => []),
    listComponentsDSL: vi.fn(async () => []),
    getPageDSL: vi.fn(async () => null),
    getLayoutDSL: vi.fn(async () => null),
  };
}

const getDesignSystemMock = vi.hoisted(() => vi.fn());
const buildGeneratedDocumentStyleBandsMock = vi.hoisted(() => vi.fn());
const buildStoredRenderStylesDataMock = vi.hoisted(() => vi.fn());
const buildStageRenderStylesDataMock = vi.hoisted(() => vi.fn());

vi.mock("../../actions/_designSystemPersist", () => ({
  getDesignSystem: getDesignSystemMock,
}));

vi.mock("../../actions/styles", () => ({
  buildGeneratedDocumentStyleBands: buildGeneratedDocumentStyleBandsMock,
  buildStoredRenderStylesData: buildStoredRenderStylesDataMock,
  buildStageRenderStylesData: buildStageRenderStylesDataMock,
}));

describe("buildComponentSnapshotInput", () => {
  it("returns null when the component does not exist", async () => {
    const adapter = createAdapter(null);

    await expect(
      buildComponentSnapshotInput("missing", adapter),
    ).resolves.toBeNull();
  });

  it("builds snapshot input with resolved render styles", async () => {
    getDesignSystemMock.mockResolvedValue({ breakpoints: [] });
    buildGeneratedDocumentStyleBandsMock.mockResolvedValue({
      rendererBaseFragment: null,
      generatedDocumentCss: "generated-css",
    });
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

    const component: ComponentDSL = {
      id: "hero-cta",
      name: "Hero CTA",
      nodes: [
        {
          id: "node-1",
          type: "text",
          props: {},
          styles: {},
          children: [],
        },
      ],
      settings: { cssVariables: { "--brand": "#000" } },
    };
    const adapter = createAdapter(component, {});

    const snapshotInput = await buildComponentSnapshotInput(
      "hero-cta",
      adapter,
    );

    expect(snapshotInput).toEqual({
      componentId: "hero-cta",
      componentUpdatedAt: null,
      nodes: [
        {
          id: "node-1",
          type: "text",
          props: {},
          styles: {},
          children: [],
        },
      ],
      settings: {},
      renderStyles: {
        globalCSS: "stage-global",
        baseCSS: "stage-base",
        utilityCSS: "stage-utility",
      },
      pageCssVariables: { "--brand": "#000" },
    });
    expect(buildGeneratedDocumentStyleBandsMock).toHaveBeenCalled();
    expect(buildStageRenderStylesDataMock).toHaveBeenCalledWith({
      storedRenderStyles: {
        globalCSS: "stored-global",
        baseCSS: "stored-base",
        utilityCSS: "stored-utility",
      },
      generatedDocumentCss: "generated-css",
      rendererBaseFragment: null,
    });
  });

  it("derives snapshot renderer ownership from component slot defaults", async () => {
    getDesignSystemMock.mockResolvedValue({ breakpoints: [] });
    buildGeneratedDocumentStyleBandsMock.mockResolvedValue({
      rendererBaseFragment: null,
      generatedDocumentCss: "generated-css",
    });
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

    const component: ComponentDSL = {
      id: "footer",
      name: "Footer",
      nodes: [],
      slots: [
        {
          name: "logo",
          defaultContent: [
            {
              id: "managed-logo",
              type: "Image",
              props: { src: "/media/source/current/logo.png" },
              styles: {},
              children: [],
              metadata: {
                responsiveImage: {
                  sizes: "100vw",
                  default: {
                    url: "/media/source/current/logo.png",
                    reference: { mediaId: "logo", variantId: null },
                    width: 727,
                    height: 621,
                    allowDerivatives: true,
                  },
                  sources: {},
                },
              },
            },
          ],
        },
      ],
    };
    const adapter = createAdapter(component, {});

    await buildComponentSnapshotInput("footer", adapter);

    expect(buildStageRenderStylesDataMock).toHaveBeenLastCalledWith({
      storedRenderStyles: {
        globalCSS: "stored-global",
        baseCSS: "stored-base",
        utilityCSS: "stored-utility",
      },
      generatedDocumentCss: "generated-css",
      rendererBaseFragment: expect.objectContaining({
        kind: "renderer-base",
        requirements: ["managed-image-intrinsic-ratio"],
      }),
    });
  });
});
