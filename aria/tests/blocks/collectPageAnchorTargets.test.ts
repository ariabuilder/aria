import { describe, expect, it } from "vitest";

import { collectPageAnchorTargets } from "../../lib/blocks/collectPageAnchorTargets";
import type { BuilderNode } from "../../lib/types/nodes";

function node(id: string, overrides: Partial<BuilderNode> = {}): BuilderNode {
  return {
    id,
    type: "Container",
    props: {},
    styles: {},
    children: [],
    ...overrides,
  };
}

describe("collectPageAnchorTargets", () => {
  it("returns empty array for empty roots", () => {
    expect(collectPageAnchorTargets([])).toEqual([]);
  });

  it("collects props.id from nested nodes", () => {
    const roots: BuilderNode[] = [
      node("section-1", {
        props: { id: "hero" },
        metadata: { label: "Hero" },
        children: [
          node("heading-1", {
            type: "Heading",
            props: { id: "intro" },
          }),
        ],
      }),
    ];

    expect(collectPageAnchorTargets(roots)).toEqual([
      { id: "hero", label: "Hero" },
      { id: "intro", label: "Heading" },
    ]);
  });

  it("deduplicates ids using first occurrence in tree order", () => {
    const roots: BuilderNode[] = [
      node("first", {
        props: { id: "pricing" },
        metadata: { label: "First Pricing" },
      }),
      node("second", {
        props: { id: "pricing" },
        metadata: { label: "Second Pricing" },
      }),
    ];

    expect(collectPageAnchorTargets(roots)).toEqual([
      { id: "pricing", label: "First Pricing" },
    ]);
  });

  it("ignores whitespace-only ids and trims values", () => {
    const roots: BuilderNode[] = [
      node("empty", { props: { id: "   " } }),
      node("trimmed", {
        props: { id: "  pricing  " },
        metadata: { label: "Pricing" },
      }),
    ];

    expect(collectPageAnchorTargets(roots)).toEqual([
      { id: "pricing", label: "Pricing" },
    ]);
  });

  it("collects ids across multiple roots (layout-like trees)", () => {
    const roots: BuilderNode[] = [
      node("page-section", {
        props: { id: "main" },
        metadata: { label: "Main" },
      }),
      node("header-section", {
        props: { id: "site-header" },
        metadata: { label: "Header" },
      }),
    ];

    expect(collectPageAnchorTargets(roots)).toEqual([
      { id: "main", label: "Main" },
      { id: "site-header", label: "Header" },
    ]);
  });

  it("sorts results alphabetically by id", () => {
    const roots: BuilderNode[] = [
      node("z", { props: { id: "zulu" } }),
      node("a", { props: { id: "alpha" } }),
      node("m", { props: { id: "middle" } }),
    ];

    expect(collectPageAnchorTargets(roots).map((target) => target.id)).toEqual([
      "alpha",
      "middle",
      "zulu",
    ]);
  });
});
