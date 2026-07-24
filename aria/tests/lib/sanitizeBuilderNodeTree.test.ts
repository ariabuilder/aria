import { describe, expect, it } from "vitest";

import {
  collectUndefinedPropPaths,
  normalizeImportedNodeTree,
  sanitizeBuilderNodeTree,
} from "../../lib/blocks/sanitizeBuilderNodeTree";
import type { BuilderNode } from "../../lib/types/nodes";

describe("sanitizeBuilderNodeTree", () => {
  it("removes undefined prop values recursively", () => {
    const nodes: BuilderNode[] = [
      {
        id: "n_test0001",
        type: "Link",
        props: {
          href: "#",
          target: undefined,
          rel: undefined,
        },
        styles: {},
        children: [],
      },
    ];

    const sanitized = sanitizeBuilderNodeTree(nodes);

    expect(sanitized[0]?.props).toEqual({ href: "#" });
    expect(collectUndefinedPropPaths(sanitized)).toEqual([]);
  });

  it("hoists button labels from a single text child", () => {
    const nodes: BuilderNode[] = [
      {
        id: "n_test0002",
        type: "Button",
        props: { type: "submit" },
        styles: {},
        children: [
          {
            id: "n_test0003",
            type: "Span",
            props: { text: "Subscribe" },
            styles: {},
            children: [],
          },
        ],
      },
    ];

    const normalized = normalizeImportedNodeTree(nodes);

    expect(normalized[0]?.props.text).toBe("Subscribe");
    expect(normalized[0]?.children).toEqual([]);
  });

  it("moves misclassified negative utilities from customClasses to classNames.base", () => {
    const nodes: BuilderNode[] = [
      {
        id: "n_test0005",
        type: "Div",
        props: {},
        styles: {},
        customClasses: ["-mt-4", "hero-shell"],
        children: [],
      },
    ];

    const sanitized = sanitizeBuilderNodeTree(nodes);

    expect(sanitized[0]?.classNames?.base).toEqual(["-mt-4"]);
    expect(sanitized[0]?.customClasses).toEqual(["hero-shell"]);
  });

  it("moves misclassified group from customClasses to classNames.base", () => {
    const nodes: BuilderNode[] = [
      {
        id: "n_test0004",
        type: "Div",
        props: {},
        styles: {},
        customClasses: ["group"],
        children: [],
      },
    ];

    const sanitized = sanitizeBuilderNodeTree(nodes);

    expect(sanitized[0]?.classNames?.base).toEqual(["group"]);
    expect(sanitized[0]?.customClasses).toEqual([]);
  });
});
