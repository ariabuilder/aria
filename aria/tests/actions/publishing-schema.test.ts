import { describe, expect, it } from "vitest";

import { PublishPageInputSchema } from "../../actions/publishing";

const validPublishInput = {
  id: "page-1",
  slug: "home",
  nodes: [{ id: "hero", type: "Section" }],
  settings: {
    seo: {
      title: "Home",
      structuredData: { "@context": "https://schema.org", "@type": "WebPage" },
    },
  },
};

describe("PublishPageInputSchema", () => {
  it("accepts canonical builder nodes and JSON-LD settings", () => {
    expect(PublishPageInputSchema.safeParse(validPublishInput).success).toBe(
      true,
    );
    const legacyPayload = PublishPageInputSchema.parse({
      ...validPublishInput,
      regions: {},
    });
    expect(legacyPayload).not.toHaveProperty("regions");
  });

  it("rejects malformed nodes and non-JSON structured data", () => {
    expect(
      PublishPageInputSchema.safeParse({
        ...validPublishInput,
        nodes: [{ id: "hero", type: "Section", props: { class: "legacy" } }],
      }).success,
    ).toBe(false);
    expect(
      PublishPageInputSchema.safeParse({
        ...validPublishInput,
        settings: { seo: { structuredData: { invalid: undefined } } },
      }).success,
    ).toBe(false);
  });
});
