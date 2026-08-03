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
const mockGetPageVersionPins = vi.fn();
const mockPublishPageDSL = vi.fn();
const mockTouchContentRevision = vi.fn();
const mockGetDesignSystemSegments = vi.fn();
const mockRegenerateGlobalCSSArtifacts = vi.fn();
const mockSavePageSnapshot = vi.fn();
const mockCompleteCacheInvalidationJob = vi.fn();
const mockFailCacheInvalidationJob = vi.fn();
const mockWorkersPurge = vi.fn();

vi.mock("cloudflare:workers", () => ({
  cache: {
    purge: mockWorkersPurge,
  },
}));

vi.mock("../../lib/storage/getStorageAdapter", () => ({
  getStorageAdapterAsync: vi.fn(async () => ({
    getSiteSettings: mockGetSiteSettings,
    getDesignSystem: mockGetDesignSystem,
    getDesignSystemSegments: mockGetDesignSystemSegments,
    getPageDSL: mockGetPageDSL,
    getPublishedPageDSL: mockGetPublishedPageDSL,
    getPageVersionPins: mockGetPageVersionPins,
    publishPageDSL: mockPublishPageDSL,
    touchContentRevision: mockTouchContentRevision,
    getLayoutDSL: vi.fn(async () => null),
    listPagesDSL: vi.fn(async () => []),
    listLayoutsDSL: vi.fn(async () => []),
    listComponentsDSL: vi.fn(async () => []),
    getComponentDSL: vi.fn(async () => null),
    getCacheInvalidationJob: vi.fn(async () => null),
    claimDueCacheInvalidationJobs: vi.fn(
      async (input: { leaseToken: string; leaseExpiresAt: string }) => {
        const options = mockPublishPageDSL.mock.calls.at(-1)?.[2] as
          | { invalidationJob?: Record<string, unknown> }
          | undefined;
        return options?.invalidationJob
          ? [
              {
                ...options.invalidationJob,
                status: "processing",
                attemptCount: 1,
                leaseToken: input.leaseToken,
                leaseExpiresAt: input.leaseExpiresAt,
              },
            ]
          : [];
      },
    ),
    completeCacheInvalidationJob: mockCompleteCacheInvalidationJob,
    failCacheInvalidationJob: mockFailCacheInvalidationJob,
  })),
}));

vi.mock("../../actions/_shared", () =>
  createActionsSharedAuthMockModule(actionsSharedMocks),
);

vi.mock("../../actions/styles", () => ({
  regenerateGlobalCSSArtifacts: mockRegenerateGlobalCSSArtifacts,
}));

vi.mock("../../lib/rendering/pageSnapshots", () => ({
  savePageSnapshot: mockSavePageSnapshot,
}));

describe("publishing revision injection", () => {
  beforeEach(() => {
    resetActionsSharedAuthMocks(actionsSharedMocks);
    vi.clearAllMocks();

    mockGetDesignSystem.mockResolvedValue(null);
    mockGetDesignSystemSegments.mockResolvedValue({
      artifacts: { globalCSSHash: "hash-123" },
    });
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
    mockGetPageVersionPins.mockResolvedValue({
      currentVersion: "v-published",
      draftVersion: "v-published",
      publishedVersion: "v-published",
      scheduledVersion: null,
    });
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
    mockSavePageSnapshot.mockResolvedValue(undefined);
    mockWorkersPurge.mockResolvedValue({ success: true, errors: [] });

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

  it("publishes the exact saved revision using stored stylesheet artifacts", async () => {
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

  it("uses persisted stylesheet artifacts without compiling during publish", async () => {
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
        skipCSSRegeneration: false,
      } as never,
      { locals: {} } as never,
    );

    expect(result.success).toBe(true);
    expect(mockRegenerateGlobalCSSArtifacts).not.toHaveBeenCalled();
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
        expectedVersion: "v-saved",
        skipCSSRegeneration: true,
      } as never,
      { locals: {} } as never,
    );

    expect(result).toMatchObject({
      success: true,
      data: { version: "v-published" },
    });
  });

  it("publishes the saved draft rather than untrusted client nodes", async () => {
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
    expect(mockRegenerateGlobalCSSArtifacts).not.toHaveBeenCalled();
    expect(mockPublishPageDSL).toHaveBeenCalledWith(
      "home",
      expect.anything(),
      expect.objectContaining({ expectedVersion: "v-saved" }),
    );
  });

  it("keeps cache delivery durable and reports pending after bounded failures", async () => {
    mockWorkersPurge.mockResolvedValue({
      success: false,
      errors: [{ code: 1001, message: "edge unavailable" }],
    });
    const { publishing } = await import("../../actions/publishing");

    const result = await getActionHandler(publishing.publish)(
      {
        id: "home",
        expectedVersion: "v-saved",
        skipCSSRegeneration: true,
      } as never,
      { locals: {} } as never,
    );

    expect(result).toMatchObject({
      success: true,
      data: { version: "v-published", delivery: "pending" },
    });
    expect(mockWorkersPurge).toHaveBeenCalledTimes(3);
    expect(mockFailCacheInvalidationJob).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "public-route:publish:home:v-saved",
        lastError: "Workers public cache purge was not acknowledged.",
      }),
    );
  });

  it("returns the committed Cloudflare publish before delivery settles", async () => {
    let resolveRevision!: (value: {
      scope: string;
      currentRevisionId: string;
      revisionSeq: number;
      updatedAt: string;
      lastMutationKind: "save-page";
    }) => void;
    const pendingRevision = new Promise<{
      scope: string;
      currentRevisionId: string;
      revisionSeq: number;
      updatedAt: string;
      lastMutationKind: "save-page";
    }>((resolve) => {
      resolveRevision = resolve;
    });
    mockTouchContentRevision.mockReturnValueOnce(pendingRevision);
    const publishedPage = {
      id: "home",
      slug: "home",
      title: "Home",
      nodes: [],
      status: "published",
      version: "v-published",
    };
    mockGetPublishedPageDSL.mockResolvedValueOnce(publishedPage);
    const waitUntil = vi.fn();

    const { publishing } = await import("../../actions/publishing");
    const result = await getActionHandler(publishing.publish)(
      {
        id: "home",
        expectedVersion: "v-saved",
        skipCSSRegeneration: true,
      } as never,
      { locals: { cfContext: { waitUntil } } } as never,
    );

    expect(result).toMatchObject({
      success: true,
      data: { version: "v-published" },
    });
    expect(waitUntil).toHaveBeenCalledTimes(1);

    const deferred = waitUntil.mock.calls[0]?.[0] as Promise<unknown>;
    let deliverySettled = false;
    void deferred.then(() => {
      deliverySettled = true;
    });
    await Promise.resolve();
    expect(deliverySettled).toBe(false);

    resolveRevision({
      scope: "default",
      currentRevisionId: "rev-published",
      revisionSeq: 2,
      updatedAt: "2026-03-26T00:00:01.000Z",
      lastMutationKind: "save-page",
    });
    await deferred;
    expect(mockSavePageSnapshot).toHaveBeenCalledWith(
      { page: publishedPage, stage: "published" },
      expect.anything(),
      expect.objectContaining({ locals: expect.anything() }),
    );
  });
});
