import { describe, expect, it } from "vitest";
import { PAGE_DETAIL_TABS } from "@/features/Studio/pages/composables/usePageDetailTabs";

describe("PAGE_DETAIL_TABS", () => {
  it("orders detail tabs for the page workflow", () => {
    const ids = PAGE_DETAIL_TABS.map((tab) => tab.id);

    expect(ids).toEqual([
      "overview",
      "type",
      "seo",
      "access",
      "content",
      "media",
      "localization",
    ]);
  });

  it("includes media after access", () => {
    const ids = PAGE_DETAIL_TABS.map((tab) => tab.id);
    const accessIndex = ids.indexOf("access");
    const mediaIndex = ids.indexOf("media");

    expect(mediaIndex).toBeGreaterThan(accessIndex);
  });
});
