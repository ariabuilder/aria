import { describe, it, expect } from "vitest";
import { BuilderNodeSchema } from "@/lib/schemas/nodes";
import {
  normalizeBuilderNodeClassFields,
  normalizeBuilderNodeClassFieldsTree,
} from "@/lib/blocks/normalizeBuilderNodeClasses";
import type { BuilderNode } from "@/lib/types/nodes";

function node(overrides: Partial<BuilderNode> = {}): BuilderNode {
  return BuilderNodeSchema.parse({
    id: "n_test",
    type: "section",
    props: {},
    children: [],
    ...overrides,
  });
}

function childNode(overrides: Partial<BuilderNode> = {}): BuilderNode {
  return BuilderNodeSchema.parse({
    id: "n_child",
    type: "heading",
    props: { text: "Hello" },
    children: [],
    ...overrides,
  });
}

describe("normalizeBuilderNodeClassFields", () => {
  it("returns node unchanged when classNames are clean", () => {
    const input = node({ classNames: { base: ["relative"] } });
    const result = normalizeBuilderNodeClassFields(input);
    expect(result.utilitiesMigrated).toBe(0);
    expect(result.customClassesMigrated).toBe(0);
    expect(result.node.classNames?.base).toEqual(["relative"]);
  });

  it("validates classNames structure via Zod", () => {
    const input = node({ classNames: { base: ["flex"] } });
    const result = normalizeBuilderNodeClassFields(input);
    expect(result.node.classNames?.base).toContain("flex");
  });

  it("populates empty classNames when absent", () => {
    const input = node({});
    const result = normalizeBuilderNodeClassFields(input);
    expect(result.node.classNames).toBeDefined();
    expect(result.node.classNames?.base).toEqual([]);
  });

  it("recurses into children", () => {
    const input = node({
      children: [childNode({ classNames: { base: ["px-4"] } })],
    });
    const result = normalizeBuilderNodeClassFields(input);
    expect(result.node.children?.[0]?.classNames?.base).toContain("px-4");
  });

  it("is idempotent — running twice yields same result", () => {
    const input = node({ classNames: { base: ["py-20"], md: ["py-32"] } });
    const first = normalizeBuilderNodeClassFields(input);
    const second = normalizeBuilderNodeClassFields(first.node);

    expect(second.utilitiesMigrated).toBe(0);
    expect(second.customClassesMigrated).toBe(0);
    expect(second.node.classNames?.base).toEqual(first.node.classNames?.base);
    expect(second.node.classNames?.md).toEqual(first.node.classNames?.md);
  });
});

describe("BuilderNodeSchema rejects legacy fields", () => {
  it("rejects className at root level via .strict()", () => {
    const result = BuilderNodeSchema.safeParse({
      id: "n_test",
      type: "section",
      props: {},
      children: [],
      className: "text-3xl",
    });
    expect(result.success).toBe(false);
  });

  it("rejects props.class via superRefine", () => {
    const result = BuilderNodeSchema.safeParse({
      id: "n_test",
      type: "section",
      props: { class: "py-20" },
      children: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      expect(
        issues.some(
          (i) => i.path.includes("props") && i.path.includes("class"),
        ),
      ).toBe(true);
    }
  });

  it("rejects props.className via superRefine", () => {
    const result = BuilderNodeSchema.safeParse({
      id: "n_test",
      type: "section",
      props: { className: "text-lg" },
      children: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      expect(
        issues.some(
          (i) => i.path.includes("props") && i.path.includes("className"),
        ),
      ).toBe(true);
    }
  });

  it("accepts valid node with only modern class fields", () => {
    const result = BuilderNodeSchema.safeParse({
      id: "n_test",
      type: "section",
      props: {},
      children: [],
      classNames: { base: ["flex"] },
      customClasses: ["hero-section"],
    });
    expect(result.success).toBe(true);
  });
});

describe("normalizeBuilderNodeClassFieldsTree", () => {
  it("normalizes multiple nodes", () => {
    const results = normalizeBuilderNodeClassFieldsTree([
      node({ classNames: { base: ["p-4"] } }),
      node({ classNames: { base: ["m-4"] } }),
    ]);
    expect(results).toHaveLength(2);
    expect(results[0].node.classNames?.base).toContain("p-4");
    expect(results[1].node.classNames?.base).toContain("m-4");
  });
});
