import { describe, expect, it } from "vitest";

import { nodesToHtmlFragment } from "../../lib/blocks/nodesToHtml";
import type { BuilderNode } from "../../lib/types/nodes";

declare const __ARIA_FOUNDATION_RUNTIME__: "node" | "workerd";

const DESCRIPTION_LIST_NODES: BuilderNode[] = [
  {
    id: "impact-list",
    type: "List",
    props: { element: "dl", ordered: true },
    styles: {},
    classNames: {
      base: ["grid", "grid-cols-1", "sm:grid-cols-2", "lg:grid-cols-4"],
    },
    children: [
      {
        id: "impact-group",
        type: "Container",
        props: {},
        styles: {},
        children: [
          {
            id: "impact-term",
            type: "ListItem",
            props: { element: "dt", text: "Customer satisfaction" },
            styles: {},
            children: [],
          },
          {
            id: "impact-value",
            type: "ListItem",
            props: { element: "dd", text: "98%" },
            styles: {},
            children: [],
          },
        ],
      },
    ],
  },
];

describe("description-list semantic renderer parity", () => {
  it(`emits the canonical hierarchy in ${__ARIA_FOUNDATION_RUNTIME__}`, () => {
    const html = nodesToHtmlFragment(DESCRIPTION_LIST_NODES);

    expect(html).toContain(
      '<dl class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">',
    );
    expect(html).toContain("<div>");
    expect(html).toContain("<dt>Customer satisfaction</dt>");
    expect(html).toContain("<dd>98%</dd>");
    expect(html).not.toMatch(/<(?:ul|ol|li)[\s>]/);
    expect(html).not.toContain("element=");
    expect(html).not.toContain("ordered=");
  });
});
