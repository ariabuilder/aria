import { describe, expect, it, vi } from "vitest";

import type { StorageAdapter } from "../../../lib/storage/adapter";
import {
  normalizeLocalizedRoute,
  publishPageTranslation,
  savePageTranslation,
  SiteTranslationServiceError,
} from "../../../lib/localization/siteTranslations";
import { buildTranslationManifest } from "../../../lib/localization/translationManifest";
import { deriveLocalePublicationState } from "../../../lib/localization/siteTranslationSchemas";

const NOW = "2026-07-13T12:00:00.000Z";
const sourcePage = {
  id: "about",
  nodes: [
    {
      id: "about-copy",
      type: "Text",
      props: { content: "About" },
      styles: {},
      children: [],
    },
  ],
};
const sourceManifest = buildTranslationManifest(sourcePage);

function adapterForService() {
  const adapter = {
    getSiteSettings: vi.fn(async () => ({
      localization: {
        content: {
          defaultLocale: "en",
          locales: [
            { code: "en", label: "English", enabled: true, fallbacks: [] },
            { code: "fr", label: "Français", enabled: true, fallbacks: ["en"] },
          ],
        },
      },
    })),
    getPageDSL: vi.fn(async () => sourcePage),
    getPagePolicy: vi.fn(async () => ({ systemRole: "standard" })),
    getPageLocaleRoute: vi.fn(async () => null),
    getLayoutDSL: vi.fn(async () => null),
    listRedirects: vi.fn(async () => []),
    listCollections: vi.fn(async () => []),
    listPagesDSL: vi.fn(async () => []),
    acquireLocaleRouteLease: vi.fn(async (input) => ({
      locale: input.locale,
      leaseToken: input.leaseToken,
      expiresAt: input.expiresAt,
      updatedAt: input.updatedAt,
    })),
    releaseLocaleRouteLease: vi.fn(async () => undefined),
    savePageLocaleDraft: vi.fn(async (input) => ({
      pageId: input.version.pageId,
      locale: input.version.locale,
      draftVersion: input.version.version,
      publishedVersion: null,
      currentVersion: input.version.version,
      publishedAt: null,
      updatedAt: input.updatedAt,
    })),
  } as unknown as StorageAdapter;
  return adapter;
}

function version() {
  return {
    pageId: "about",
    locale: "fr",
    version: "fr-v1",
    sourceVersion: "source-v1",
    slug: "a-propos",
    accessPromptTitle: null,
    accessPromptDescription: null,
    seo: {
      title: "À propos",
      description: null,
      canonicalPath: null,
      noindex: false,
      nofollow: false,
      ogTitle: null,
      ogDescription: null,
      ogImage: null,
    },
    dsl: JSON.parse(JSON.stringify(sourcePage)),
    translatedPaths: [],
    sourceManifestHash: sourceManifest.hash,
    sourceStructureHash: sourceManifest.structureHash,
    layoutId: null,
    fallbackLayoutVersion: null,
    contentHash: null,
    createdAt: NOW,
    actor: { id: "u1", username: "andy", email: null, avatarUrl: null },
  };
}

describe("site translation service", () => {
  it("keeps publication, draft changes, freshness, and suppression as separate matrix axes", () => {
    expect(
      deriveLocalePublicationState({
        enabled: false,
        meta: { currentVersion: "fr-v2", publishedVersion: "fr-v1" },
        currentSourceVersion: "source-v3",
        publishedSourceVersion: "source-v2",
        currentTranslationSourceVersion: "source-v3",
        publishedTranslationSourceVersion: "source-v1",
        suppressedBy: ["route"],
      }),
    ).toEqual({
      publication: "published",
      localeEnabled: false,
      hasUnpublishedChanges: true,
      draftFreshness: "current",
      publishedFreshness: "outdated",
      suppressedBy: ["locale", "route"],
    });
  });

  it("canonicalizes decoded routes into one collision key", () => {
    expect(normalizeLocalizedRoute("/À%20propos/")).toEqual({
      pathname: "/%C3%80%20propos",
      pathnameKey: "/%c3%80%20propos",
    });
    expect(normalizeLocalizedRoute("/A-Propos/")).toEqual({
      pathname: "/A-Propos",
      pathnameKey: "/a-propos",
    });
    expect(() => normalizeLocalizedRoute("/admin")).toThrow(
      SiteTranslationServiceError,
    );
    expect(() => normalizeLocalizedRoute("/%2Fprivate")).toThrow(
      /unsafe path segment/i,
    );
  });

  it("locks the locale and persists an immutable non-default draft", async () => {
    const adapter = adapterForService();
    const result = await savePageTranslation(adapter, {
      version: version(),
      expectedCurrentVersion: null,
      pathname: "/À%20propos",
    });

    expect(result.currentVersion).toBe("fr-v1");
    expect(adapter.savePageLocaleDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        route: {
          pathname: "/%C3%80%20propos",
          pathnameKey: "/%c3%80%20propos",
        },
      }),
    );
    expect(adapter.releaseLocaleRouteLease).toHaveBeenCalledTimes(1);
  });

  it("moves descendant draft routes with a renamed parent draft", async () => {
    const adapter = {
      ...adapterForService(),
      listPagesDSL: vi.fn(async () => [
        { id: "team", slug: "team", parent: null, systemRole: "standard" },
        {
          id: "about",
          slug: "about",
          parent: "team",
          systemRole: "standard",
        },
      ]),
      getPageLocaleRoute: vi.fn(async (pageId: string) =>
        pageId === "team"
          ? {
              pageId: "team",
              locale: "fr",
              pathname: "/equipe",
              pathnameKey: "/equipe",
              draftClaim: true,
              publishedClaim: true,
            }
          : null,
      ),
      listPageLocaleRecords: vi.fn(async () => [
        {
          meta: { pageId: "about", locale: "fr" },
          routes: [
            {
              pageId: "about",
              locale: "fr",
              pathname: "/equipe/a-propos",
              pathnameKey: "/equipe/a-propos",
              draftClaim: true,
              publishedClaim: true,
            },
          ],
        },
      ]),
    } as unknown as StorageAdapter;

    await savePageTranslation(adapter, {
      version: { ...version(), pageId: "team", version: "fr-team-v2" },
      expectedCurrentVersion: "fr-team-v1",
      pathname: "/notre-equipe",
    });

    expect(adapter.savePageLocaleDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        draftRouteMoves: [
          {
            pageId: "about",
            route: {
              pathname: "/notre-equipe/a-propos",
              pathnameKey: "/notre-equipe/a-propos",
            },
          },
        ],
      }),
    );
  });

  it("promotes descendant published claims when the renamed parent publishes", async () => {
    const adapter = {
      ...adapterForService(),
      listPagesDSL: vi.fn(async () => [
        { id: "team", slug: "team", parent: null, systemRole: "standard" },
        { id: "about", slug: "about", parent: "team", systemRole: "standard" },
      ]),
      getPageVersionPins: vi.fn(async () => ({
        currentVersion: "source-v1",
        draftVersion: "source-v1",
        publishedVersion: "source-v1",
      })),
      getPageLocaleMeta: vi.fn(async () => ({
        pageId: "team",
        locale: "fr",
        currentVersion: "fr-team-v2",
        draftVersion: "fr-team-v2",
        publishedVersion: "fr-team-v1",
      })),
      getPageLocaleVersion: vi.fn(async () => ({
        ...version(),
        pageId: "team",
        version: "fr-team-v2",
      })),
      listPageLocaleRecords: vi.fn(async () => [
        {
          meta: { pageId: "team", locale: "fr" },
          routes: [
            {
              pageId: "team",
              locale: "fr",
              pathname: "/notre-equipe",
              pathnameKey: "/notre-equipe",
              draftClaim: true,
              publishedClaim: false,
            },
            {
              pageId: "team",
              locale: "fr",
              pathname: "/equipe",
              pathnameKey: "/equipe",
              draftClaim: false,
              publishedClaim: true,
            },
          ],
        },
        {
          meta: { pageId: "about", locale: "fr" },
          routes: [
            {
              pageId: "about",
              locale: "fr",
              pathname: "/notre-equipe/a-propos",
              pathnameKey: "/notre-equipe/a-propos",
              draftClaim: true,
              publishedClaim: false,
            },
            {
              pageId: "about",
              locale: "fr",
              pathname: "/equipe/a-propos",
              pathnameKey: "/equipe/a-propos",
              draftClaim: false,
              publishedClaim: true,
            },
          ],
        },
      ]),
      publishPageLocaleDraft: vi.fn(async () => ({
        pageId: "team",
        locale: "fr",
        currentVersion: "fr-team-v2",
        draftVersion: "fr-team-v2",
        publishedVersion: "fr-team-v2",
        publishedAt: NOW,
        updatedAt: NOW,
      })),
    } as unknown as StorageAdapter;

    await publishPageTranslation(adapter, {
      pageId: "team",
      locale: "fr",
      expectedCurrentVersion: "fr-team-v2",
    });

    expect(adapter.publishPageLocaleDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        publishedRouteMoves: [
          { pageId: "about", pathnameKey: "/notre-equipe/a-propos" },
        ],
        invalidationJob: expect.objectContaining({
          payload: expect.objectContaining({ resourceIds: ["team", "about"] }),
        }),
      }),
    );
  });

  it("does not permit a shadow translation of the canonical default locale", async () => {
    const adapter = adapterForService();
    await expect(
      savePageTranslation(adapter, {
        version: { ...version(), locale: "en" },
        expectedCurrentVersion: null,
        pathname: "/about",
      }),
    ).rejects.toMatchObject({ code: "DEFAULT_LOCALE" });
    expect(adapter.savePageLocaleDraft).not.toHaveBeenCalled();
  });

  it("does not allow a CMS template translation to claim a direct locale route", async () => {
    const adapter = {
      ...adapterForService(),
      getPagePolicy: vi.fn(async () => ({ systemRole: "cms-entry" })),
    } as unknown as StorageAdapter;
    await expect(
      savePageTranslation(adapter, {
        version: version(),
        expectedCurrentVersion: null,
        pathname: "/a-propos",
      }),
    ).rejects.toMatchObject({ code: "SYSTEM_ROLE_CONFLICT" });
  });

  it("does not let a localized page take over an enabled redirect source", async () => {
    const adapter = {
      ...adapterForService(),
      listRedirects: vi.fn(async () => [
        { fromPath: "/fr/a-propos", enabled: true },
      ]),
    } as unknown as StorageAdapter;

    await expect(
      savePageTranslation(adapter, {
        version: version(),
        expectedCurrentVersion: null,
        pathname: "/a-propos",
      }),
    ).rejects.toMatchObject({ code: "ROUTE_CONFLICT" });
  });

  it("does not let a localized page take over a CMS entry pattern", async () => {
    const adapter = {
      ...adapterForService(),
      listCollections: vi.fn(async () => [
        {
          id: "blog",
          label: "Blog",
          templatePageId: "blog-entry-template",
          urlPattern: "/blog/{slug}",
        },
      ]),
    } as unknown as StorageAdapter;

    await expect(
      savePageTranslation(adapter, {
        version: version(),
        expectedCurrentVersion: null,
        pathname: "/blog/a-propos",
      }),
    ).rejects.toMatchObject({ code: "ROUTE_CONFLICT" });
  });

  it("requires a draft route for every localized ancestor", async () => {
    const adapter = {
      ...adapterForService(),
      listPagesDSL: vi.fn(async () => [
        {
          id: "parent",
          slug: "parent",
          title: "Parent",
          parent: null,
        },
        {
          id: "about",
          slug: "about",
          title: "About",
          parent: "parent",
        },
      ]),
    } as unknown as StorageAdapter;

    await expect(
      savePageTranslation(adapter, {
        version: version(),
        expectedCurrentVersion: null,
        pathname: "/parent/a-propos",
      }),
    ).rejects.toMatchObject({ code: "ANCESTOR_TRANSLATION_REQUIRED" });
  });

  it("refuses to publish a locale version pinned to an older canonical source", async () => {
    const adapter = {
      ...adapterForService(),
      getPageVersionPins: vi.fn(async () => ({
        draftVersion: "source-v2",
        publishedVersion: "source-v2",
        currentVersion: "source-v2",
      })),
      getPageLocaleMeta: vi.fn(async () => ({
        pageId: "about",
        locale: "fr",
        draftVersion: "fr-v1",
        publishedVersion: null,
        currentVersion: "fr-v1",
        publishedAt: null,
        updatedAt: NOW,
      })),
      getPageLocaleVersion: vi.fn(async () => version()),
    } as unknown as StorageAdapter;

    await expect(
      publishPageTranslation(adapter, {
        pageId: "about",
        locale: "fr",
        expectedCurrentVersion: "fr-v1",
      }),
    ).rejects.toMatchObject({ code: "TRANSLATION_OUTDATED" });
  });
});
