import { describe, expect, it } from "vitest";
import {
  getExclusionReason,
  isPageDiscoverable,
} from "../../lib/crawl/discoverability";
import type { PageForDiscovery } from "../../lib/crawl/schemas";

function page(overrides: Partial<PageForDiscovery>): PageForDiscovery {
  return {
    id: "p1",
    slug: "about",
    status: "published",
    systemRole: "standard",
    accessMode: "public",
    ...overrides,
  };
}

describe("discoverability", () => {
  it("includes published public pages", () => {
    expect(isPageDiscoverable(page({}))).toBe(true);
    expect(getExclusionReason(page({}))).toBe("included");
  });

  it("excludes draft pages", () => {
    expect(isPageDiscoverable(page({ status: "draft" }))).toBe(false);
  });

  it("excludes password pages", () => {
    expect(getExclusionReason(page({ accessMode: "password" }))).toBe(
      "password",
    );
  });

  it("excludes noindex pages", () => {
    expect(
      isPageDiscoverable(
        page({ settings: { seo: { noindex: true } } }),
      ),
    ).toBe(false);
  });

  it("excludes cms-entry pages from page sitemap discovery", () => {
    expect(getExclusionReason(page({ systemRole: "cms-entry" }))).toBe(
      "cms-entry",
    );
    expect(isPageDiscoverable(page({ systemRole: "cms-entry" }))).toBe(false);
  });

  it("includes cms-collection pages in page sitemap discovery", () => {
    expect(getExclusionReason(page({ systemRole: "cms-collection" }))).toBe(
      "included",
    );
    expect(isPageDiscoverable(page({ systemRole: "cms-collection" }))).toBe(
      true,
    );
  });
});
