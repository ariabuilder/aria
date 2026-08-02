import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getActionHandler } from "../../helpers/actionHandler";

vi.mock("../../../admin/features/Studio/pages/composables/usePageRevert", () => ({
  GetPageVersionsInputSchema: z.object({ slug: z.string().min(1) }),
  GetPageVersionsOutputSchema: z.object({
    versions: z.array(z.unknown()),
    protectedVersions: z.array(z.string()),
  }),
  GetVersionSnapshotInputSchema: z.object({
    slug: z.string().min(1),
    versionId: z.string().min(1),
  }),
  GetVersionSnapshotOutputSchema: z.object({
    dsl: z.record(z.string(), z.unknown()),
  }),
  RevertVersionInputSchema: z.object({
    slug: z.string().min(1),
    versionId: z.string().min(1),
  }),
  RevertVersionOutputSchema: z.object({ version: z.string() }),
  DeleteVersionInputSchema: z.object({
    slug: z.string().min(1),
    versionId: z.string().min(1),
  }),
  DeleteVersionOutputSchema: z.object({ success: z.literal(true) }),
}));

const {
  listPagesDSLMock,
  requireAuthMock,
  loggerMock,
  getStorageAdapterAsyncMock,
} = vi.hoisted(() => ({
  listPagesDSLMock: vi.fn(),
  requireAuthMock: vi.fn(),
  loggerMock: vi.fn(),
  getStorageAdapterAsyncMock: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  defineAction: <T extends Record<string, unknown>>(config: T) => config,
}));

vi.mock("../../../lib/storage/getStorageAdapter", () => ({
  getStorageAdapterAsync: (...args: unknown[]) =>
    getStorageAdapterAsyncMock(...args),
}));

vi.mock("../../../actions/_shared", () => ({
  requireAuth: (...args: unknown[]) => requireAuthMock(...args),
  requireOperation: vi.fn().mockResolvedValue(undefined),
  requireCapability: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../lib/utils/logger", () => ({
  log: (...args: unknown[]) => loggerMock(...args),
}));

describe("pages.listInventory", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getStorageAdapterAsyncMock.mockResolvedValue({
      // The action now consumes the policy summary fields straight off the
      // `listPagesDSL` rows (one SELECT against `aria_page_meta`) instead of
      // pairing them up post-fetch via `listPagePolicySummaries`.
      listPagesDSL: listPagesDSLMock,
      getSiteSettings: vi.fn().mockResolvedValue({
        styleRevision: "style-7",
      }),
      listStoredPageThumbnailKeys: vi
        .fn()
        .mockResolvedValue(
          new Set(["home:draft", "about:published", "contact:draft"]),
        ),
      listStoredComponentThumbnailKeys: vi
        .fn()
        .mockResolvedValue(new Set<string>()),
    });
    requireAuthMock.mockResolvedValue(undefined);
  });

  it("returns page inventory with snapshot URLs for Studio refreshes", async () => {
    listPagesDSLMock.mockResolvedValue([
      {
        id: "home",
        slug: "index",
        title: "Home",
        status: "draft",
        updatedAt: "2026-04-04T11:00:00.000Z",
        systemRole: "not-found",
        accessMode: "public",
        hasPassword: false,
      },
      {
        id: "about",
        slug: "about",
        title: "About",
        status: "published",
        updatedAt: "2026-04-04T11:05:00.000Z",
        systemRole: "standard",
        accessMode: "password",
        hasPassword: true,
      },
      {
        id: "contact",
        slug: "contact",
        title: "Contact",
        status: "published",
        isModifiedSincePublish: true,
        updatedAt: "2026-04-04T12:00:00.000Z",
        systemRole: "standard",
        accessMode: "public",
        hasPassword: false,
      },
    ]);

    const { pages } = await import("../../../actions/pages");

    const result = await getActionHandler(pages.listInventory)(undefined, {
      locals: {},
    });

    expect(listPagesDSLMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      pages: [
        expect.objectContaining({
          id: "home",
          systemRole: "not-found",
          accessMode: "public",
          hasPassword: false,
          snapshotUrl:
            "/admin/api/page-snapshots/index?stage=draft&v=2026-04-04T11%3A00%3A00.000Z&sr=style-7",
          thumbnailUrl:
            "/admin/api/page-thumbnails/home?stage=draft&v=2026-04-04T11%3A00%3A00.000Z&sr=style-7",
          thumbnail: expect.objectContaining({
            status: "ready",
            stage: "draft",
            url: "/admin/api/page-thumbnails/home?stage=draft&v=2026-04-04T11%3A00%3A00.000Z&sr=style-7",
            fingerprint: expect.any(String),
          }),
        }),
        expect.objectContaining({
          id: "about",
          systemRole: "standard",
          accessMode: "password",
          hasPassword: true,
          snapshotUrl:
            "/admin/api/page-snapshots/about?stage=published&v=2026-04-04T11%3A05%3A00.000Z&sr=style-7",
          thumbnailUrl:
            "/admin/api/page-thumbnails/about?stage=published&v=2026-04-04T11%3A05%3A00.000Z&sr=style-7",
          thumbnail: expect.objectContaining({
            status: "ready",
            stage: "published",
            url: "/admin/api/page-thumbnails/about?stage=published&v=2026-04-04T11%3A05%3A00.000Z&sr=style-7",
            fingerprint: expect.any(String),
          }),
        }),
        expect.objectContaining({
          id: "contact",
          isModifiedSincePublish: true,
          snapshotUrl:
            "/admin/api/page-snapshots/contact?stage=draft&v=2026-04-04T12%3A00%3A00.000Z&sr=style-7",
          thumbnailUrl:
            "/admin/api/page-thumbnails/contact?stage=draft&v=2026-04-04T12%3A00%3A00.000Z&sr=style-7",
          thumbnail: expect.objectContaining({
            status: "ready",
            stage: "draft",
            url: "/admin/api/page-thumbnails/contact?stage=draft&v=2026-04-04T12%3A00%3A00.000Z&sr=style-7",
            fingerprint: expect.any(String),
          }),
        }),
      ],
    });
  });

  it("returns an empty inventory when the adapter yields no pages", async () => {
    listPagesDSLMock.mockResolvedValue(undefined);

    const { pages } = await import("../../../actions/pages");

    const result = await getActionHandler(pages.listInventory)(undefined, {
      locals: {},
    });

    expect(result).toEqual({ pages: [] });
  });

  it("loads detail core without policy, history, settings, or R2 scans", async () => {
    const page = {
      id: "home",
      slug: "index",
      title: "Home",
      status: "draft",
      nodes: [],
      updatedAt: "2026-07-13T12:00:00.000Z",
    };
    const getPageDSL = vi.fn().mockResolvedValue(page);
    const getSiteSettings = vi.fn();
    const listStoredPageThumbnailKeys = vi.fn();
    const getPagePolicy = vi.fn();
    const getPageVersions = vi.fn();
    getStorageAdapterAsyncMock.mockResolvedValue({
      getPageDSL,
      getSiteSettings,
      listStoredPageThumbnailKeys,
      getPagePolicy,
      getPageVersions,
    });

    const { pages } = await import("../../../actions/pages");
    const result = await getActionHandler(pages.getDetailBundle)(
      { slug: "index", activityLimit: 5 },
      { locals: {} },
    );

    expect(getPageDSL).toHaveBeenCalledOnce();
    expect(getSiteSettings).not.toHaveBeenCalled();
    expect(listStoredPageThumbnailKeys).not.toHaveBeenCalled();
    expect(getPagePolicy).not.toHaveBeenCalled();
    expect(getPageVersions).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      page,
      inventory: null,
      policy: null,
      activity: null,
      preview: null,
    });
  });
});
