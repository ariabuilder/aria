import { describe, expect, it } from "vitest";
import { validatePageDSL } from "../../lib/schemas/nodes";

describe("index page seo load", () => {
  it("preserves noindex through validatePageDSL", () => {
    const parsed = {
      id: "index",
      slug: "index",
      name: "Home",
      title: "Home",
      status: "published",
      path: "/",
      settings: {
        seo: {
          noindex: true,
          nofollow: true,
        },
      },
      nodes: [],
    };

    expect(parsed.settings?.seo?.noindex).toBe(true);

    const validation = validatePageDSL(parsed);
    expect(validation.success).toBe(true);
    if (validation.success) {
      expect(validation.data.settings?.seo?.noindex).toBe(true);
      expect(validation.data.settings?.seo?.nofollow).toBe(true);
    }
  });
});
