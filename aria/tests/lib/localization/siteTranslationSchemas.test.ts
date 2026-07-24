import { describe, expect, it } from "vitest";

import {
  CacheInvalidationJobSchema,
  LayoutLocaleVersionSchema,
  LocalePublicationStateSchema,
  LocalizedRouteSchema,
  PageLocaleVersionSchema,
  TranslationManifestSchema,
  LocalizedSeoSchema,
} from "../../../lib/localization/siteTranslationSchemas";

const now = "2026-07-13T12:00:00.000Z";

describe("site translation schemas", () => {
  it("keeps publication state orthogonal", () => {
    const parsed = LocalePublicationStateSchema.parse({
      publication: "published",
      localeEnabled: false,
      hasUnpublishedChanges: true,
      draftFreshness: "current",
      publishedFreshness: "outdated",
      suppressedBy: ["locale", "invalidation"],
    });

    expect(parsed.publication).toBe("published");
    expect(parsed.suppressedBy).toEqual(["locale", "invalidation"]);
  });

  it("requires at least one route claim", () => {
    expect(() =>
      LocalizedRouteSchema.parse({
        locale: "fr",
        pathname: "/a-propos",
        pathnameKey: "/a-propos",
        pageId: "about",
        draftClaim: false,
        publishedClaim: false,
      }),
    ).toThrow(/draft or published claim/i);
  });

  it("rejects duplicate stable translation paths", () => {
    expect(() =>
      TranslationManifestSchema.parse({
        hash: "a".repeat(16),
        structureHash: "b".repeat(16),
        entries: [
          {
            path: "node:hero.props.heading",
            kind: "text",
            required: true,
            nullable: false,
            allowEmpty: false,
            maxBytes: 1_024,
          },
          {
            path: "node:hero.props.heading",
            kind: "text",
            required: true,
            nullable: false,
            allowEmpty: false,
            maxBytes: 1_024,
          },
        ],
      }),
    ).toThrow(/more than once/i);
  });

  it("requires complete pinned layout fallback identity", () => {
    expect(() =>
      PageLocaleVersionSchema.parse({
        pageId: "about",
        locale: "fr",
        version: "v1",
        sourceVersion: "v4",
        slug: "a-propos",
        accessPromptTitle: null,
        accessPromptDescription: null,
        seo: {
          title: null,
          description: null,
          canonicalPath: null,
          noindex: false,
          nofollow: false,
          ogTitle: null,
          ogDescription: null,
          ogImage: null,
        },
        dsl: {},
        translatedPaths: [],
        sourceManifestHash: "a".repeat(16),
        sourceStructureHash: "b".repeat(16),
        layoutId: "marketing",
        fallbackLayoutVersion: null,
        contentHash: null,
        createdAt: now,
        actor: { id: null, username: null, email: null, avatarUrl: null },
      }),
    ).toThrow(/layout fallback/i);
  });

  it("keeps localized canonical URLs resolver-owned", () => {
    expect(() =>
      LocalizedSeoSchema.parse({
        title: null,
        description: null,
        canonicalPath: "/a-propos",
        noindex: false,
        nofollow: false,
        ogTitle: null,
        ogDescription: null,
        ogImage: null,
      }),
    ).toThrow();
  });

  it("accepts immutable page/layout snapshots and retryable invalidation jobs", () => {
    const page = PageLocaleVersionSchema.parse({
      pageId: "about",
      locale: "fr",
      version: "v1",
      sourceVersion: "v4",
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
      dsl: { id: "about" },
      translatedPaths: ["page.title"],
      sourceManifestHash: "a".repeat(16),
      sourceStructureHash: "b".repeat(16),
      layoutId: "marketing",
      fallbackLayoutVersion: "v2",
      contentHash: "c".repeat(16),
      createdAt: now,
      actor: { id: "u1", username: "andy", email: null, avatarUrl: null },
    });
    const layout = LayoutLocaleVersionSchema.parse({
      layoutId: "marketing",
      locale: "fr",
      version: "v2",
      sourceVersion: "v7",
      dsl: { id: "marketing" },
      translatedPaths: [],
      sourceManifestHash: "a".repeat(16),
      sourceStructureHash: "b".repeat(16),
      contentHash: null,
      createdAt: now,
      actor: { id: null, username: null, email: null, avatarUrl: null },
    });
    const job = CacheInvalidationJobSchema.parse({
      id: "job-1",
      idempotencyKey: "publish:about:fr:v1",
      scope: "public-route",
      payload: { paths: ["/fr/a-propos"] },
      status: "pending",
      attemptCount: 0,
      nextAttemptAt: now,
      leaseToken: null,
      leaseExpiresAt: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    });

    expect(page.fallbackLayoutVersion).toBe("v2");
    expect(layout.sourceVersion).toBe("v7");
    expect(job.status).toBe("pending");
  });
});
