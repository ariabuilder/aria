import { describe, expect, it } from "vitest";
import { countComponentReferences } from "../../../lib/components/references";

describe("countComponentReferences", () => {
  it("counts supported node reference shapes and page regions", () => {
    const resource = {
      metadata: {
        regions: {
          headerComponent: "hero",
          footerComponent: "hero",
        },
      },
      nodes: [
        { type: "Component", componentRef: "hero" },
        { type: "Component", reference: { masterId: "hero" } },
        { type: "Component", props: { componentId: "other" } },
      ],
    };

    expect(countComponentReferences(resource, "hero")).toBe(4);
    expect(countComponentReferences(resource, "other")).toBe(1);
  });

  it("does not count arbitrary matching strings", () => {
    expect(
      countComponentReferences(
        { title: "hero", nodes: [{ props: { label: "hero" } }] },
        "hero",
      ),
    ).toBe(0);
  });
});
