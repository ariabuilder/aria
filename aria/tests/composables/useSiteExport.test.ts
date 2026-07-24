import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import type { UseSiteExportReturn } from "../../admin/features/Studio/settings/composables/useSiteExport";

const EXPORT_ID_ONE = "11111111-1111-4111-8111-111111111111";
const EXPORT_ID_TWO = "22222222-2222-4222-8222-222222222222";
const EXPORT_ID_THREE = "33333333-3333-4333-8333-333333333333";

const mockImportExportList = vi.fn();
const mockSiteExportList = vi.fn();
const mockSiteExportCreate = vi.fn();
const mockSiteExportDelete = vi.fn();
const mockLog = vi.fn();
const mockNavigate = vi.fn();

const baseExportRecord = {
  filename: "aria-site-export-test.zip",
  artifactKey: "_exports/site/test/aria-site-export-test.zip",
  metadataKey: "_exports/site/test/meta.json",
  createdAt: "2026-03-27T11:00:00.000Z",
  expiresAt: "2026-03-27T11:15:00.000Z",
  createdBy: {
    id: "99999999-9999-4999-8999-999999999999",
    username: "test-user",
  },
  pageCount: 3,
  mediaCount: 4,
  cmsCollectionCount: 2,
  cmsEntryCount: 8,
  redirectCount: 3,
  sizeBytes: 4096,
  downloadPath: "/api/site-exports/export-1",
};

vi.mock("astro:actions", () => ({
  actions: {
    importExport: {
      list: (...args: unknown[]) => mockImportExportList(...args),
    },
    siteExport: {
      list: (...args: unknown[]) => mockSiteExportList(...args),
      create: (...args: unknown[]) => mockSiteExportCreate(...args),
      delete: (...args: unknown[]) => mockSiteExportDelete(...args),
    },
  },
}));

vi.mock("@/lib/utils/logger", () => ({
  log: (...args: unknown[]) => mockLog(...args),
}));

const icons = {
  fileCode: "icon-pages",
  layout: "icon-layouts",
  component: "icon-components",
} as const;

describe("useSiteExport", () => {
  let wrapper: ReturnType<typeof mount> | null = null;
  let siteExport: UseSiteExportReturn;

  beforeEach(() => {
    vi.clearAllMocks();

    mockImportExportList.mockResolvedValue({
      data: {
        pages: [{ id: "home", title: "Home" }],
        layouts: [{ id: "default-layout", title: "Default Layout" }],
        components: [{ id: "hero-banner", title: "Hero Banner" }],
        cmsCollections: [{ id: "collection-blog", title: "Blog" }],
        cmsEntries: [{ id: "collection-blog", title: "Blog", count: 8 }],
      },
    });
    mockSiteExportList.mockResolvedValue({
      data: {
        exports: [
          {
            id: EXPORT_ID_ONE,
            ...baseExportRecord,
          },
          {
            id: EXPORT_ID_THREE,
            filename: "aria-site-export-older.zip",
            artifactKey: "_exports/site/older/aria-site-export-older.zip",
            metadataKey: "_exports/site/older/meta.json",
            createdAt: "2026-03-26T11:00:00.000Z",
            expiresAt: "2026-03-26T11:15:00.000Z",
            createdBy: baseExportRecord.createdBy,
            pageCount: 2,
            mediaCount: 1,
            cmsCollectionCount: 0,
            cmsEntryCount: 0,
            redirectCount: 1,
            sizeBytes: 2048,
            downloadPath: "/api/site-exports/export-3",
          },
        ],
      },
    });
    mockSiteExportCreate.mockResolvedValue({
      data: {
        export: {
          id: EXPORT_ID_TWO,
          filename: "aria-site-export-created.zip",
          artifactKey: "_exports/site/new/aria-site-export-created.zip",
          metadataKey: "_exports/site/new/meta.json",
          createdAt: "2026-03-27T12:00:00.000Z",
          expiresAt: "2026-03-27T12:30:00.000Z",
          createdBy: baseExportRecord.createdBy,
          pageCount: 5,
          mediaCount: 6,
          cmsCollectionCount: 3,
          cmsEntryCount: 12,
          redirectCount: 4,
          sizeBytes: 8192,
          downloadPath: "/api/site-exports/export-2",
        },
      },
    });
    mockSiteExportDelete.mockResolvedValue({
      data: {
        success: true,
        deletedId: EXPORT_ID_ONE,
      },
    });
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.useRealTimers();
  });

  async function mountComposable() {
    const { useSiteExport } =
      await import("../../admin/features/Studio/settings/composables/useSiteExport");

    const TestComponent = defineComponent({
      setup() {
        siteExport = useSiteExport(icons, {
          navigate: mockNavigate,
        });
        return () => h("div");
      },
    });

    wrapper = mount(TestComponent);
    await flushPromises();
  }

  it("loads export inventory and all exports on mount", async () => {
    await mountComposable();

    expect(mockImportExportList).toHaveBeenCalledTimes(1);
    expect(mockSiteExportList).toHaveBeenCalledTimes(1);
    expect(siteExport.totalExportableItems.value).toBe(12);
    expect(siteExport.exports.value).toHaveLength(2);
    expect(siteExport.latestExport.value?.id).toBe(EXPORT_ID_ONE);
    expect(siteExport.latestExport.value).toMatchObject({
      cmsCollectionCount: 2,
      cmsEntryCount: 8,
      redirectCount: 3,
    });
    expect(siteExport.exportGroups.value).toEqual([
      {
        key: "pages",
        label: "Pages",
        icon: "icon-pages",
        items: [{ id: "home", title: "Home" }],
      },
      {
        key: "layouts",
        label: "Layouts",
        icon: "icon-layouts",
        items: [{ id: "default-layout", title: "Default Layout" }],
      },
      {
        key: "components",
        label: "Components",
        icon: "icon-components",
        items: [{ id: "hero-banner", title: "Hero Banner" }],
      },
      {
        key: "cmsCollections",
        label: "CMS Collections",
        icon: "icon-components",
        items: [{ id: "collection-blog", title: "Blog" }],
      },
      {
        key: "cmsEntries",
        label: "CMS Entries",
        icon: "icon-pages",
        items: [{ id: "collection-blog", title: "Blog", count: 8 }],
      },
    ]);
  });

  it("creates a site export with the configured ttl and prepends it", async () => {
    await mountComposable();

    siteExport.exportTtlMinutes.value = 10_080;
    await siteExport.createSiteExport();

    expect(mockSiteExportCreate).toHaveBeenCalledWith({
      ttlMinutes: 10_080,
      selection: expect.objectContaining({ preset: "full" }),
    });
    expect(siteExport.exports.value[0]?.id).toBe(EXPORT_ID_TWO);
    expect(siteExport.exports.value).toHaveLength(3);
    expect(siteExport.exportError.value).toBeNull();
  });

  it("deletes an export and keeps the remaining backups", async () => {
    await mountComposable();

    await siteExport.deleteExport(EXPORT_ID_ONE);

    expect(mockSiteExportDelete).toHaveBeenCalledWith({ id: EXPORT_ID_ONE });
    expect(siteExport.exports.value.map((record) => record.id)).toEqual([
      EXPORT_ID_THREE,
    ]);
    expect(siteExport.latestExport.value?.id).toBe(EXPORT_ID_THREE);
  });

  it("downloads an export by record", async () => {
    await mountComposable();

    siteExport.downloadExport(siteExport.exports.value[0]!);

    expect(mockNavigate).toHaveBeenCalledWith("/api/site-exports/export-1");
    expect(mockSiteExportList).toHaveBeenCalledTimes(1);
  });

  it("resets inventory and logs when inventory loading fails", async () => {
    mockImportExportList.mockRejectedValueOnce(new Error("network failed"));

    await mountComposable();

    expect(siteExport.exportInventory.value).toEqual({
      pages: [],
      layouts: [],
      components: [],
      cmsCollections: [],
      cmsEntries: [],
    });
    expect(mockLog).toHaveBeenCalledWith(
      "error",
      "[useSiteExport] Failed to load export inventory",
      expect.objectContaining({
        error: expect.any(Error),
      }),
    );
  });

  it("rejects malformed export list payloads", async () => {
    mockSiteExportList.mockResolvedValueOnce({
      data: {
        exports: [{ id: 42 }],
      },
    });

    await mountComposable();

    expect(siteExport.exports.value).toEqual([]);
    expect(siteExport.exportError.value).toBe("Failed to load exports");
    expect(mockLog).toHaveBeenCalledWith(
      "warn",
      "[SiteExport] Invalid site export list response",
      expect.objectContaining({
        source: "useSiteExport.loadExports",
        issues: expect.any(Array),
      }),
    );
  });

  it("defaults CMS counts when loading older export records", async () => {
    mockSiteExportList.mockResolvedValueOnce({
      data: {
        exports: [
          {
            id: EXPORT_ID_ONE,
            ...baseExportRecord,
            cmsCollectionCount: undefined,
            cmsEntryCount: undefined,
            redirectCount: undefined,
          },
        ],
      },
    });

    await mountComposable();

    expect(siteExport.exports.value[0]).toMatchObject({
      id: EXPORT_ID_ONE,
      cmsCollectionCount: 0,
      cmsEntryCount: 0,
      redirectCount: 0,
    });
  });

  it("treats embedded inventory errors as failures", async () => {
    mockImportExportList.mockResolvedValueOnce({
      data: {
        pages: [],
        layouts: [],
        components: [],
        cmsCollections: [],
        cmsEntries: [],
        error: "Inventory unavailable",
      },
    });

    await mountComposable();

    expect(siteExport.exportInventory.value).toEqual({
      pages: [],
      layouts: [],
      components: [],
      cmsCollections: [],
      cmsEntries: [],
    });
    expect(mockLog).toHaveBeenCalledWith(
      "error",
      "[useSiteExport] Failed to load export inventory",
      expect.objectContaining({
        error: expect.any(Error),
      }),
    );
  });

  it("fails delete when the delete action returns an invalid payload", async () => {
    await mountComposable();

    mockSiteExportDelete.mockResolvedValueOnce({
      data: {
        success: true,
        deletedId: 42,
      },
    });

    await siteExport.deleteExport(EXPORT_ID_ONE);

    expect(siteExport.exports.value.map((record) => record.id)).toEqual([
      EXPORT_ID_ONE,
      EXPORT_ID_THREE,
    ]);
    expect(siteExport.exportError.value).toBe("Failed to delete export");
    expect(mockLog).toHaveBeenCalledWith(
      "warn",
      "[SiteExport] Invalid site export delete response",
      expect.objectContaining({
        source: "useSiteExport.deleteExport",
        exportId: EXPORT_ID_ONE,
        issues: expect.any(Array),
      }),
    );
  });

  it("formats export titles and relative expiry labels", async () => {
    await mountComposable();

    expect(
      siteExport.formatExportTitle({
        id: EXPORT_ID_ONE,
        filename: "aria-site-export-2026-03-27T11-00-00-000Z.zip",
        createdAt: "2026-03-27T11:00:00.000Z",
        expiresAt: "2026-03-27T12:00:00.000Z",
        pageCount: 1,
        mediaCount: 0,
        sizeBytes: 100,
        downloadPath: "/admin/exports/test",
      }),
    ).toMatch(/Mar 27, 2026/);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-27T11:30:00.000Z"));

    expect(siteExport.formatRelativeExpiry("2026-03-27T12:00:00.000Z")).toBe(
      "30m left",
    );

    expect(
      siteExport.formatExportExpiry({
        id: EXPORT_ID_ONE,
        filename: "aria-site-export-keep.zip",
        createdAt: "2026-05-23T16:10:23.843Z",
        expiresAt: "2126-04-29T16:10:23.843Z",
        pageCount: 1,
        mediaCount: 0,
        sizeBytes: 100,
        downloadPath: "/admin/exports/test",
      }),
    ).toBe("Never expires");
  });
});
