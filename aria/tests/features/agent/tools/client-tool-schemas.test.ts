import { describe, expect, it } from "vitest";
import {
  ClientToolOpenInComposerInputSchema,
  AriaUpdatePageMetaInputSchema,
} from "../../../../admin/features/Agent/lib/schemas";

describe("client navigation tool schemas", () => {
  it("accepts open_in_composer payloads", () => {
    const parsed = ClientToolOpenInComposerInputSchema.safeParse({
      itemType: "page",
      slug: "contact",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.destination).toBe("composer");
    }
  });

  it("rejects empty slug", () => {
    const parsed = ClientToolOpenInComposerInputSchema.safeParse({
      itemType: "page",
      slug: "",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("aria_update_page_meta schema", () => {
  it("accepts title-only updates", () => {
    const parsed = AriaUpdatePageMetaInputSchema.safeParse({
      slug: "contact",
      title: "Contact Us",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts slug changes", () => {
    const parsed = AriaUpdatePageMetaInputSchema.safeParse({
      slug: "contact",
      newSlug: "contact-us",
    });
    expect(parsed.success).toBe(true);
  });
});
