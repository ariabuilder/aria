import { describe, expect, it } from "vitest";

import type { Page } from "../../../admin/composables/useBuilderData";
import { getPagePolicyBadges } from "../../../admin/features/Studio/pages/composables/pagePolicyBadges";

function createPolicyPage(
  overrides: Partial<Pick<Page, "systemRole" | "accessMode">> = {},
): Pick<Page, "systemRole" | "accessMode"> {
  return {
    systemRole: "standard",
    accessMode: "public",
    ...overrides,
  };
}

describe("getPagePolicyBadges", () => {
  it("returns the 404 badge for not-found pages", () => {
    expect(
      getPagePolicyBadges(
        createPolicyPage({
          systemRole: "not-found",
          accessMode: "private",
        }),
      ),
    ).toEqual([{ key: "not-found", label: "404" }]);
  });

  it("returns the Collection badge for cms-collection pages", () => {
    expect(
      getPagePolicyBadges(
        createPolicyPage({
          systemRole: "cms-collection",
          accessMode: "private",
        }),
      ),
    ).toEqual([{ key: "cms-collection", label: "Collection" }]);
  });

  it("returns the Entry badge for cms-entry pages", () => {
    expect(
      getPagePolicyBadges(
        createPolicyPage({
          systemRole: "cms-entry",
          accessMode: "private",
        }),
      ),
    ).toEqual([{ key: "cms-entry", label: "Entry" }]);
  });

  it("returns password, private, and unlisted access badges for standard pages", () => {
    expect(
      getPagePolicyBadges(createPolicyPage({ accessMode: "password" })),
    ).toEqual([{ key: "password", label: "Password" }]);
    expect(
      getPagePolicyBadges(createPolicyPage({ accessMode: "private" })),
    ).toEqual([{ key: "private", label: "Private" }]);
    expect(
      getPagePolicyBadges(createPolicyPage({ accessMode: "unlisted" })),
    ).toEqual([{ key: "unlisted", label: "Unlisted" }]);
  });

  it("returns no badge for standard public pages", () => {
    expect(getPagePolicyBadges(createPolicyPage())).toEqual([]);
  });
});
