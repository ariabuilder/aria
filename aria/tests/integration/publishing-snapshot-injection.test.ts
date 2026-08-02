import { actionsSharedMocks } from "../mocks/actions-shared-state";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createActionsSharedAuthMockModule,
  resetActionsSharedAuthMocks,
} from "../mocks/actions-shared";
import { getActionHandler } from "../helpers/actionHandler";

const mockGetSiteSettings = vi.fn();
const mockGetDesignSystem = vi.fn();
const mockGetPageDSL = vi.fn();
const mockGetPublishedPageDSL = vi.fn();
const mockPublishPageDSL = vi.fn();
const mockTouchContentRevision = vi.fn();
const mockRegenerateGlobalCSSArtifacts = vi.fn();

vi.mock("../../lib/storage/getStorageAdapter", () => ({
  getStorageAdapterAsync: vi.fn(async () => ({
    getSiteSettings: mockGetSiteSettings,
    getDesignSystem: mockGetDesignSystem,
    getPageDSL: mockGetPageDSL,
    getPublishedPageDSL: mockGetPublishedPageDSL,
    publishPageDSL: mockPublishPageDSL,
    touchContentRevision: mockTouchContentRevision,
    getLayoutDSL: vi.fn(async () => null),
    listPagesDSL: vi.fn(async () => []),
    listLayoutsDSL: vi.fn(async () => []),
    listComponentsDSL: vi.fn(async () => []),
    getComponentDSL: vi.fn(async () => null),
  })),
}));

vi.mock("../../actions/_shared", () =>
  createActionsSharedAuthMockModule(actionsSharedMocks),
);

vi.mock("../../actions/styles", () => ({
  regenerateGlobalCSSArtifacts: mockRegenerateGlobalCSSArtifacts,
}));

describe("publishing revision injection", () => {
  beforeEach(() => {
    resetActionsSharedAuthMocks(actionsSharedMocks);
    vi.clearAllMocks();

    mockGetDesignSystem.mockResolvedValue(null);
    mockGetPageDSL.mockResolvedValue({
      id: "home",
      slug: "home",
      title: "Home",
      nodes: [],
      status: "draft",
      version: "v-saved",
    });
    mockGetPublishedPageDSL.mockResolvedValue(null);
    mockPublishPageDSL.mockResolvedValue("v-published");
    mockTouchContentRevision.mockResolvedValue({
      scope: "default",
      currentRevisionId: "rev-published",
      revisionSeq: 1,
      updatedAt: "2026-03-26T00:00:00.000Z",
      lastMutationKind: "save-page",
    });
    mockRegenerateGlobalCSSArtifacts.mockResolvedValue({
      globalCSSHash: "hash-123",
      cssSize: 1024,
      classCount: 3,
      lastCompiled: "2026-03-26T00:00:00.000Z",
      framework: "unocss",
    });

    mockGetSiteSettings.mockResolvedValue({
      customHeadCode: '<meta name="site-custom-head" content="ok">',
      customBodyCode: '<div id="site-custom-body-start">body-start</div>',
      customFooterCode: '<div id="site-custom-body-end">body-end</div>',
      analytics: {
        version: 1,
        activeProviders: ["google-tag-manager"],
        providers: {
          "google-tag-manager": {
            containerId: "GTM-TEST123",
          },
        },
      },
    });
  });

  it("publishes a page revision with custom code and analytics merged", async () => {
    const { publishing } = await import("../../actions/publishing");

    const result = await getActionHandler(publishing.publish)(
      {
        id: "home",
        slug: "home",
        title: "Home",
        description: "Home page",
        layout: null,
        nodes: [],
        settings: {
          headHTML: '<meta name="page-head-marker" content="present">',
        },
        expectedVersion: "v-saved",
        skipCSSRegeneration: true,
      } as never,
      { locals: {} } as never,
    );

    expect(result.success).toBe(true);
    expect(mockPublishPageDSL).toHaveBeenCalledWith(
      "home",
      expect.objectContaining({
        actor: expect.objectContaining({ id: expect.any(String) }),
      }),
      expect.objectContaining({
        expectedVersion: "v-saved",
        activityMetadata: expect.stringContaining("page_published"),
      }),
    );
    expect(mockRegenerateGlobalCSSArtifacts).not.toHaveBeenCalled();
  });

  it("reuses the shared CSS regeneration helper before publish", async () => {
    const { publishing } = await import("../../actions/publishing");

    const result = await getActionHandler(publishing.publish)(
      {
        id: "home",
        slug: "home",
        title: "Home",
        description: "Home page",
        layout: null,
        nodes: [],
        settings: {
          headHTML: '<meta name="page-head-marker" content="present">',
        },
        skipCSSRegeneration: false,
      } as never,
      { locals: {} } as never,
    );

    expect(result.success).toBe(true);
    expect(mockRegenerateGlobalCSSArtifacts).toHaveBeenCalledTimes(1);
  });

  it("returns the committed publish when snapshot refresh fails afterward", async () => {
    const { publishing } = await import("../../actions/publishing");
    mockGetPublishedPageDSL.mockRejectedValueOnce(
      new Error("snapshot read unavailable"),
    );

    const result = await getActionHandler(publishing.publish)(
      {
        id: "home",
        slug: "home",
        title: "Ignored client title",
        nodes: [],
        settings: {},
        skipCSSRegeneration: true,
      } as never,
      { locals: {} } as never,
    );

    expect(result).toMatchObject({
      success: true,
      data: { version: "v-published" },
    });
  });

  it("compiles the saved draft rather than untrusted client nodes", async () => {
    const { publishing } = await import("../../actions/publishing");
    const savedNode = {
      id: "saved-node",
      type: "Text",
      props: { content: "Saved" },
      styles: {},
      children: [],
    };
    mockGetPageDSL.mockResolvedValueOnce({
      id: "home",
      slug: "home",
      title: "Saved title",
      nodes: [savedNode],
      status: "draft",
      version: "v-saved",
    });

    const result = await getActionHandler(publishing.publish)(
      {
        id: "home",
        slug: "home",
        title: "Client title",
        nodes: [
          {
            ...savedNode,
            id: "client-node",
            props: { content: "Unsaved client edit" },
          },
        ],
        settings: {},
        expectedVersion: "v-saved",
      } as never,
      { locals: {} } as never,
    );

    expect(result.success).toBe(true);
    expect(mockRegenerateGlobalCSSArtifacts).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ utilityNodes: [savedNode] }),
    );
  });
});
