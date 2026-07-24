import { describe, expect, it, vi } from "vitest";

import type { StorageAdapter } from "../../../lib/storage/adapter";
import type { ContentLocalizationSettings } from "../../../lib/localization/contentLocale";
import {
  buildLocalePolicyInvalidationJobs,
  findLocaleEnableRouteConflicts,
  findLocaleRemovalConflicts,
  findRemovedLocaleCodes,
} from "../../../lib/localization/localePolicySafety";

const EN: ContentLocalizationSettings = {
  defaultLocale: "en",
  locales: [{ code: "en", label: "English", enabled: true, fallbacks: [] }],
};
const EN_FR: ContentLocalizationSettings = {
  defaultLocale: "en",
  locales: [
    { code: "en", label: "English", enabled: true, fallbacks: [] },
    { code: "fr", label: "French", enabled: true, fallbacks: [] },
  ],
};

function adapter(
  input: {
    pages?: unknown[];
    collections?: unknown[];
    redirects?: unknown[];
    publishedRoutes?: Record<string, unknown[]>;
    pageLocaleRecords?: unknown[];
    layoutLocaleRecords?: unknown[];
  } = {},
): StorageAdapter {
  return {
    listPagesDSL: vi.fn(async () => input.pages ?? []),
    listCollections: vi.fn(async () => input.collections ?? []),
    listRedirects: vi.fn(async () => input.redirects ?? []),
    listPublishedPageLocaleRoutes: vi.fn(
      async (pageId: string) => input.publishedRoutes?.[pageId] ?? [],
    ),
    listPageLocaleRecords: vi.fn(async () => input.pageLocaleRecords ?? []),
    listLayoutLocaleRecords: vi.fn(async () => input.layoutLocaleRecords ?? []),
  } as unknown as StorageAdapter;
}

describe("locale policy route safety", () => {
  it("rejects a newly enabled locale that would reinterpret a published page tree", async () => {
    const conflicts = await findLocaleEnableRouteConflicts({
      adapter: adapter({
        pages: [
          {
            id: "fr-page",
            slug: "fr",
            title: "French landing page",
            parent: null,
            status: "published",
            systemRole: "standard",
          },
        ],
      }),
      current: EN,
      next: EN_FR,
    });

    expect(conflicts).toEqual([
      "Published page 'French landing page' already owns the /fr route prefix.",
    ]);
  });

  it("rejects a newly enabled locale that overlaps CMS patterns or redirects", async () => {
    const conflicts = await findLocaleEnableRouteConflicts({
      adapter: adapter({
        collections: [
          {
            id: "collection-fr",
            label: "French posts",
            templatePageId: "template",
            urlPattern: "/fr/posts/{slug}",
          },
        ],
        redirects: [{ fromPath: "/FR/old", enabled: true }],
      }),
      current: EN,
      next: EN_FR,
    });

    expect(conflicts).toEqual([
      "CMS collection 'French posts' already owns the /fr route prefix.",
      "Redirect '/FR/old' already owns the /fr route prefix.",
    ]);
  });

  it("rejects CMS patterns whose dynamic first segment would absorb the locale prefix", async () => {
    const conflicts = await findLocaleEnableRouteConflicts({
      adapter: adapter({
        collections: [
          {
            id: "collection-dynamic-root",
            label: "Topic posts",
            templatePageId: "template",
            urlPattern: "/{slug}/posts",
          },
        ],
      }),
      current: EN,
      next: EN_FR,
    });

    expect(conflicts).toEqual([
      "CMS collection 'Topic posts' already owns the /fr route prefix.",
    ]);
  });

  it("runs the same preflight when a disabled locale is re-enabled", async () => {
    const disabled = {
      ...EN_FR,
      locales: EN_FR.locales.map((locale) =>
        locale.code === "fr" ? { ...locale, enabled: false } : locale,
      ),
    } satisfies ContentLocalizationSettings;
    const conflicts = await findLocaleEnableRouteConflicts({
      adapter: adapter({ redirects: [{ fromPath: "/fr/old", enabled: true }] }),
      current: disabled,
      next: EN_FR,
    });

    expect(conflicts).toHaveLength(1);
  });

  it("keeps saved locale codes immutable while allowing disablement", () => {
    expect(
      findRemovedLocaleCodes({
        current: EN_FR,
        next: EN,
      }),
    ).toEqual(["fr"]);
    expect(
      findRemovedLocaleCodes({
        current: EN_FR,
        next: {
          ...EN_FR,
          locales: EN_FR.locales.map((locale) =>
            locale.code === "fr" ? { ...locale, enabled: false } : locale,
          ),
        },
      }),
    ).toEqual([]);
  });

  it("allows removing an unused locale and blocks removal with translations", async () => {
    await expect(
      findLocaleRemovalConflicts({
        adapter: adapter(),
        current: EN_FR,
        next: EN,
      }),
    ).resolves.toEqual([]);

    await expect(
      findLocaleRemovalConflicts({
        adapter: adapter({
          pageLocaleRecords: [{ meta: { locale: "fr" } }],
          layoutLocaleRecords: [{ meta: { locale: "fr" } }],
        }),
        current: EN_FR,
        next: EN,
      }),
    ).resolves.toEqual([
      "Locale fr cannot be removed while it has 1 page translation and 1 layout translation. Delete its translations first.",
    ]);
  });

  it("enqueues route purges for every affected published locale route", async () => {
    const jobs = await buildLocalePolicyInvalidationJobs({
      adapter: adapter({
        pages: [{ id: "about" }, { id: "contact" }],
        publishedRoutes: {
          about: [
            {
              locale: "fr",
              pathname: "/a-propos",
              pathnameKey: "/a-propos",
            },
          ],
          contact: [
            {
              locale: "fr",
              pathname: "/contactez-nous",
              pathnameKey: "/contactez-nous",
            },
          ],
        },
      }),
      current: EN_FR,
      next: {
        ...EN_FR,
        locales: EN_FR.locales.map((locale) =>
          locale.code === "fr" ? { ...locale, enabled: false } : locale,
        ),
      },
      now: "2026-07-13T12:00:00.000Z",
    });

    expect(jobs).toEqual([
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(
          /^locale-policy:locale-policy-[^:]+:disable:fr:about:\/a-propos$/,
        ),
        scope: "locale-policy",
        payload: expect.objectContaining({
          operation: "disable",
          resourceId: "about",
          locale: "fr",
          pathname: "/a-propos",
        }),
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(
          /^locale-policy:locale-policy-[^:]+:disable:fr:contact:\/contactez-nous$/,
        ),
        scope: "locale-policy",
        payload: expect.objectContaining({
          resourceId: "contact",
          pathname: "/contactez-nous",
        }),
      }),
    ]);
  });

  it("creates fresh route-purge intent for a later disable cycle", async () => {
    const storage = adapter({
      pages: [{ id: "about" }],
      publishedRoutes: {
        about: [
          { locale: "fr", pathname: "/a-propos", pathnameKey: "/a-propos" },
        ],
      },
    });
    const disabled = {
      ...EN_FR,
      locales: EN_FR.locales.map((locale) =>
        locale.code === "fr" ? { ...locale, enabled: false } : locale,
      ),
    } satisfies ContentLocalizationSettings;
    const first = await buildLocalePolicyInvalidationJobs({
      adapter: storage,
      current: EN_FR,
      next: disabled,
      now: "2026-07-13T12:00:00.000Z",
    });
    await buildLocalePolicyInvalidationJobs({
      adapter: storage,
      current: disabled,
      next: EN_FR,
      now: "2026-07-13T13:00:00.000Z",
    });
    const second = await buildLocalePolicyInvalidationJobs({
      adapter: storage,
      current: EN_FR,
      next: disabled,
      now: "2026-07-14T12:00:00.000Z",
    });

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(second[0]?.idempotencyKey).not.toBe(first[0]?.idempotencyKey);
  });
});
