import { describe, expect, it } from "vitest";

import { buildClassManagerUsageIndex } from "../../../admin/features/Design/lib/classManagerInventory";

describe("classManagerInventory", () => {
  it("builds usage counts and locations from node customClasses", () => {
    const usageIndex = buildClassManagerUsageIndex([
      {
        collection: "pages",
        id: "home",
        label: "Home",
        path: "/home",
        nodes: [
          {
            id: "hero",
            type: "section",
            props: {},
            classNames: { base: [] },
            customClasses: ["hero-heading", "hero-shell"],
            className: undefined,
            styles: {},
            children: [
              {
                id: "headline",
                type: "heading",
                props: { text: "Hello" },
                classNames: { base: [] },
                customClasses: ["hero-heading"],
                className: undefined,
                styles: {},
                children: [],
                interactions: {},
                variants: {},
                a11y: {},
                dataSource: undefined,
                reference: undefined,
                metadata: {},
              },
            ],
            interactions: {},
            variants: {},
            a11y: {},
            dataSource: undefined,
            reference: undefined,
            metadata: { label: "Hero" },
          },
        ],
      },
      {
        collection: "components",
        id: "button-card",
        label: "Button Card",
        path: "button-card",
        nodes: [
          {
            id: "button-node",
            type: "button",
            props: {},
            classNames: { base: [] },
            customClasses: ["hero-shell"],
            className: undefined,
            styles: {},
            children: [],
            interactions: {},
            variants: {},
            a11y: {},
            dataSource: undefined,
            reference: undefined,
            metadata: {},
          },
        ],
      },
    ]);

    expect(usageIndex["hero-heading"]).toMatchObject({
      references: 2,
      pageCount: 1,
      componentCount: 0,
    });
    expect(usageIndex["hero-shell"]).toMatchObject({
      references: 2,
      pageCount: 1,
      componentCount: 1,
    });
    expect(usageIndex["hero-shell"].locations[0]).toMatchObject({
      itemLabel: "Home",
      nodeLabel: "Hero",
    });
  });
});
