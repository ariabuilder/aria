import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/cloudflare/env", () => ({
  getCloudflareEnv: vi.fn(() => ({
    CLOUDFLARE_API_TOKEN: "test-token",
    CLOUDFLARE_ZONE_ID: "test-zone",
  })),
}));

import {
  getAllPublicPagesCacheTag,
  getPublicLayoutCacheTag,
  getPublicPageCacheTags,
  purgePublicCacheTags,
} from "../../lib/cache/service";
import {
  deliverContentRevisionForAction,
  touchContentRevisionForAction,
} from "../../lib/content-sync/mutations";

describe("public page cache", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true }),
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("builds stable cache tags for public pages", () => {
    const tags = getPublicPageCacheTags({
      id: "page-home",
      slug: "marketing/home",
    });

    expect(tags).toEqual([
      getAllPublicPagesCacheTag(),
      "aria-page-id:page-home",
      "aria-page-slug:marketing-home",
    ]);
  });

  it("adds locale, route, and immutable-version identities for translated pages", () => {
    expect(
      getPublicPageCacheTags({
        id: "about",
        slug: "about",
        locale: "fr",
        version: "locale-v2",
        pathnameKey: "/a-propos",
      }),
    ).toEqual([
      getAllPublicPagesCacheTag(),
      "aria-page-id:about",
      "aria-page-slug:about",
      "aria-page-locale:about:fr",
      "aria-page-locale-version:about:fr:locale-v2",
      "aria-page-locale-route:fr:-a-propos",
    ]);
  });

  it("purges only the supplied localization cache identities", async () => {
    await expect(
      purgePublicCacheTags({ locals: {} }, [
        "aria-page-id:about",
        getPublicLayoutCacheTag("marketing-shell"),
      ]),
    ).resolves.toBe(true);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/zones/test-zone/purge_cache",
      expect.objectContaining({
        body: JSON.stringify({
          tags: ["aria-page-id:about", "aria-layout-id:marketing-shell"],
        }),
      }),
    );
  });

  it("purges all public pages when shared dependencies change", async () => {
    const adapter = {
      touchContentRevision: vi.fn(async () => ({ currentRevisionId: "rev-1" })),
    };

    await touchContentRevisionForAction(
      adapter as never,
      {
        mutationKind: "save-styles",
        mutationTarget: "default",
      },
      { locals: {} },
    );

    expect(adapter.touchContentRevision).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/zones/test-zone/purge_cache",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ tags: [getAllPublicPagesCacheTag()] }),
      }),
    );
  });

  it("does not purge public pages for a draft component delivery", async () => {
    await deliverContentRevisionForAction(
      {
        scope: "default",
        currentRevisionId: "rev-2",
        revisionSeq: 2,
        updatedAt: "2026-08-02T23:00:00.000Z",
        lastMutationKind: "save-component",
        lastMutationTarget: "header",
      },
      {
        mutationKind: "save-component",
        mutationTarget: "header",
      },
      { locals: {} },
      { purgePublicPages: false },
    );

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
