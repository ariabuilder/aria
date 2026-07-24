import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildAuthorshipSaveContext } from "../../lib/authorship/stamping";
import {
  deleteMediaWithReferenceSafety,
  renameMediaWithReferenceMigration,
  scrubReferencesForDeletedMedia,
} from "../../lib/media/catalog/mediaLifecycle";
import {
  StoredMediaUsageSchema,
  type SiteSettings,
  type StorageAdapter,
} from "../../lib/storage/adapter";
import type { SessionUser } from "../../lib/auth/types";
import type { PageDSL } from "../../lib/types/nodes";

const administrator: SessionUser = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  username: "admin",
  email: "admin@example.com",
  role: "administrator",
  totpEnabled: false,
};

const authorship = buildAuthorshipSaveContext(administrator, "save-page");

const pageWithHero: PageDSL = {
  id: "home",
  title: "Home",
  slug: "home",
  nodes: [
    {
      id: "n1",
      type: "Image",
      props: { src: "/uploads/gallery/hero.jpg" },
      styles: {},
      children: [],
    },
  ],
};

function createAdapter(
  overrides: Partial<StorageAdapter> = {},
): StorageAdapter {
  const pages = new Map<string, PageDSL>([
    ["home", structuredClone(pageWithHero)],
  ]);
  const media = new Map<string, Buffer>([
    ["gallery/hero.jpg", Buffer.from("hero-bytes")],
  ]);
  let siteSettings: SiteSettings = {
    favicon: "/uploads/gallery/hero.jpg",
  };

  const adapter = {
    getPageDSL: vi.fn(async (id: string) => pages.get(id) ?? null),
    getPublishedPageDSL: vi.fn(async () => null),
    savePageDSL: vi.fn(async (id: string, dsl: PageDSL) => {
      pages.set(id, structuredClone(dsl));
      return "1";
    }),
    listPagesDSL: vi.fn(async () =>
      Array.from(pages.values()).map((page) => ({
        id: page.id,
        slug: page.slug,
        title: page.title,
        status: "draft" as const,
        isModifiedSincePublish: false,
        systemRole: "standard" as const,
        accessMode: "public" as const,
        hasPassword: false,
      })),
    ),
    getLayoutDSL: vi.fn(async () => null),
    saveLayoutDSL: vi.fn(async () => "1"),
    listLayoutsDSL: vi.fn(async () => []),
    getComponentDSL: vi.fn(async () => null),
    saveComponentDSL: vi.fn(async () => "1"),
    listComponentsDSL: vi.fn(async () => []),
    listCollections: vi.fn(async () => []),
    listPageLocaleRecords: vi.fn(async () => []),
    listLayoutLocaleRecords: vi.fn(async () => []),
    getDesignSystem: vi.fn(async () => null),
    listMediaUsageByLogicalPath: vi.fn(async () =>
      StoredMediaUsageSchema.array().parse([
        {
          kind: "page",
          refId: "home",
          refPath: "nodes[0].props.src",
        },
      ]),
    ),
    getSiteSettings: vi.fn(async () => structuredClone(siteSettings)),
    saveSiteSettings: vi.fn(async (next: SiteSettings) => {
      siteSettings = structuredClone(next);
    }),
    getMedia: vi.fn(async (path: string) => media.get(path) ?? null),
    saveMedia: vi.fn(async (path: string, buffer: Buffer) => {
      media.set(path, buffer);
      return `https://cdn.example.com/uploads/${path}`;
    }),
    deleteMedia: vi.fn(async (path: string) => {
      media.delete(path);
    }),
    listMediaCatalogAssetsByLogicalPaths: vi.fn(async () => []),
    getMediaTransformState: vi.fn(async () => ({
      profile: null,
      sourceVersions: [],
      variants: [],
    })),
    moveMediaTransformState: vi.fn(async () => undefined),
    moveMediaCatalogAsset: vi.fn(async () => ({
      moved: true,
      logicalPath: "/uploads/gallery/renamed.jpg",
    })),
    deleteMediaTransformState: vi.fn(async () => undefined),
    markMediaCatalogAssetDeleted: vi.fn(async () => ({ found: true })),
    ...overrides,
  };

  return adapter as unknown as StorageAdapter;
}

describe("mediaLifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scrubs references before delete workflows consume the summary", async () => {
    const adapter = createAdapter();

    const summary = await scrubReferencesForDeletedMedia(
      adapter,
      { authorship },
      "/uploads/gallery/hero.jpg",
    );

    expect(summary.updatedLocations).toBeGreaterThan(0);
    expect((await adapter.getPageDSL("home"))?.nodes[0]?.props.src).toBe("");
    expect(summary.failures).toEqual([]);
  });

  it("migrates references and deletes the old file only after migration succeeds", async () => {
    const adapter = createAdapter();

    const result = await renameMediaWithReferenceMigration(
      adapter,
      { authorship },
      {
        oldKey: "gallery/hero.jpg",
        newName: "renamed.jpg",
        endpointId: "local-fs",
      },
    );

    expect(result.newPath).toBe("gallery/renamed.jpg");
    expect(result.url).toBe("/uploads/gallery/renamed.jpg");
    expect((await adapter.getPageDSL("home"))?.nodes[0]?.props.src).toBe(
      "/uploads/gallery/renamed.jpg",
    );
    expect(await adapter.getMedia("gallery/hero.jpg")).toBeNull();
    expect(await adapter.getMedia("gallery/renamed.jpg")).not.toBeNull();
    expect(adapter.deleteMedia).toHaveBeenCalledWith("gallery/hero.jpg");
  });

  it("retains both files when reference migration is incomplete", async () => {
    const adapter = createAdapter({
      savePageDSL: vi.fn(async () => {
        throw new Error("page save failed");
      }),
    });

    await expect(
      renameMediaWithReferenceMigration(
        adapter,
        { authorship },
        {
          oldKey: "gallery/hero.jpg",
          newName: "renamed.jpg",
          endpointId: "local-fs",
        },
      ),
    ).resolves.toMatchObject({
      status: "incomplete",
      oldRetained: true,
    });

    expect(await adapter.getMedia("gallery/hero.jpg")).not.toBeNull();
    expect(await adapter.getMedia("gallery/renamed.jpg")).not.toBeNull();
    expect((await adapter.getPageDSL("home"))?.nodes[0]?.props.src).toBe(
      "/uploads/gallery/hero.jpg",
    );
  });

  it("blocks rename when the target filename already exists", async () => {
    const adapter = createAdapter({
      getMedia: vi.fn(async (path: string) => {
        if (path === "gallery/renamed.jpg") {
          return Buffer.from("existing");
        }
        if (path === "gallery/hero.jpg") {
          return Buffer.from("hero-bytes");
        }
        return null;
      }),
    });

    await expect(
      renameMediaWithReferenceMigration(
        adapter,
        { authorship },
        {
          oldKey: "gallery/hero.jpg",
          newName: "renamed.jpg",
          endpointId: "local-fs",
        },
      ),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("blocks rename when destination transform state already exists", async () => {
    const adapter = createAdapter({
      getMediaTransformState: vi.fn(async (path: string) => ({
        profile:
          path === "/uploads/gallery/renamed.jpg"
            ? ({ assetPath: path } as never)
            : null,
        sourceVersions: [],
        variants: [],
      })),
    });

    await expect(
      renameMediaWithReferenceMigration(
        adapter,
        { authorship },
        {
          oldKey: "gallery/hero.jpg",
          newName: "renamed.jpg",
          endpointId: "local-fs",
        },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(adapter.saveMedia).not.toHaveBeenCalled();
  });

  it("blocks an identical destination owned by a different catalog asset", async () => {
    const adapter = createAdapter({
      getMedia: vi.fn(async (path: string) =>
        path === "gallery/hero.jpg" || path === "gallery/renamed.jpg"
          ? Buffer.from("hero-bytes")
          : null,
      ),
      listMediaCatalogAssetsByLogicalPaths: vi.fn(async (paths) => [
        {
          id: paths[0]?.includes("renamed") ? "target-id" : "source-id",
          logical_path: paths[0]!,
          filename: "hero.jpg",
          mime_type: "image/jpeg",
          size_bytes: 10,
          width: null,
          height: null,
          status: "active" as const,
          updated_at: "2026-07-14T12:00:00.000Z",
          public_url: null,
        },
      ]),
    });

    await expect(
      renameMediaWithReferenceMigration(
        adapter,
        { authorship },
        {
          oldKey: "gallery/hero.jpg",
          newName: "renamed.jpg",
          endpointId: "local-fs",
        },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("resumes an incomplete rename when the retained destination is identical", async () => {
    const adapter = createAdapter({
      listPagesDSL: vi.fn(async () => []),
      listMediaUsageByLogicalPath: vi.fn(async () => []),
      getSiteSettings: vi.fn(async () => null),
    });
    await adapter.saveMedia("gallery/renamed.jpg", Buffer.from("hero-bytes"));
    vi.mocked(adapter.saveMedia).mockClear();

    const result = await renameMediaWithReferenceMigration(
      adapter,
      { authorship },
      {
        oldKey: "gallery/hero.jpg",
        newName: "renamed.jpg",
        endpointId: "local-fs",
      },
    );

    expect(result).toMatchObject({ status: "completed", oldRetained: false });
    expect(adapter.saveMedia).not.toHaveBeenCalled();
    expect(await adapter.getMedia("gallery/hero.jpg")).toBeNull();
    expect(await adapter.getMedia("gallery/renamed.jpg")).not.toBeNull();
  });

  it("does not physically delete after partial reference cleanup", async () => {
    const adapter = createAdapter({
      savePageDSL: vi.fn(async () => {
        throw new Error("page save failed");
      }),
    });

    const result = await deleteMediaWithReferenceSafety(
      adapter,
      { authorship },
      {
        objectKey: "gallery/hero.jpg",
        logicalPath: "/uploads/gallery/hero.jpg",
        updatedAt: "2026-07-14T12:00:00.000Z",
      },
    );

    expect(result).toMatchObject({ status: "incomplete", deleted: false });
    expect(await adapter.getMedia("gallery/hero.jpg")).not.toBeNull();
    expect(adapter.deleteMedia).not.toHaveBeenCalled();
    expect(adapter.deleteMediaTransformState).not.toHaveBeenCalled();
    expect(adapter.markMediaCatalogAssetDeleted).not.toHaveBeenCalled();
  });

  it("reports derived cleanup failure after physical deletion", async () => {
    const adapter = createAdapter({
      listPagesDSL: vi.fn(async () => []),
      listMediaUsageByLogicalPath: vi.fn(async () => []),
      getSiteSettings: vi.fn(async () => null),
      deleteMediaTransformState: vi.fn(async () => {
        throw new Error("transform cleanup failed");
      }),
    });

    const result = await deleteMediaWithReferenceSafety(
      adapter,
      { authorship },
      {
        objectKey: "gallery/hero.jpg",
        logicalPath: "/uploads/gallery/hero.jpg",
        updatedAt: "2026-07-14T12:00:00.000Z",
      },
    );

    expect(result).toMatchObject({ status: "incomplete", deleted: true });
    expect(result.references.warnings[0]).toContain("transform cleanup failed");
    expect(await adapter.getMedia("gallery/hero.jpg")).toBeNull();
  });
});
