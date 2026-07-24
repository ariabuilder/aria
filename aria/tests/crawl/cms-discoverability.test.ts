import { describe, expect, it } from "vitest";

import {
  isCmsEntryDiscoverable,
  isCmsEntryRouteTemplateEligible,
} from "../../lib/crawl/cmsDiscoverability";
import type { PageForDiscovery } from "../../lib/crawl/schemas";

function templatePage(
  overrides: Partial<PageForDiscovery> = {},
): PageForDiscovery {
  return {
    id: "page-template",
    slug: "post-template",
    status: "published",
    systemRole: "standard",
    accessMode: "public",
    ...overrides,
  };
}

describe("cms discoverability", () => {
  it("keeps cms-entry pages eligible for entry route discovery", () => {
    expect(
      isCmsEntryRouteTemplateEligible(
        templatePage({ systemRole: "cms-entry" }),
      ),
    ).toBe(true);
  });

  it("excludes not-found templates from entry route discovery", () => {
    expect(
      isCmsEntryRouteTemplateEligible(
        templatePage({ systemRole: "not-found" }),
      ),
    ).toBe(false);
  });

  it("includes published entries when cms-entry page renders collection routes", () => {
    expect(
      isCmsEntryDiscoverable({
        entry: {
          collectionId: "collection-blog",
          entryId: "entry-1",
          slug: "hello-world",
          pathname: "/posts/hello-world",
        },
        templatePage: templatePage({ systemRole: "cms-entry" }),
      }),
    ).toBe(true);
  });
});
