import { describe, expect, it } from "vitest";
import { ClientToolInsertDesignedSectionInputSchema } from "../../../admin/features/Agent/lib/schemas";
import {
  normalizeDesignedSectionNode,
  formatDesignedSectionIssues,
} from "../../../admin/features/Agent/lib/designedSections";
import { regenerateNodeTreeIds } from "../../../lib/ids/nodeId";
import { BuilderNodeSchema } from "../../../lib/schemas/nodes";

function createHeroNode(title: string, accent: string) {
  return {
    id: "agent-root",
    type: "section",
    metadata: { label: `${accent} launch section` },
    classNames: {
      base: ["relative", "isolate", "overflow-hidden", "px-6", "py-24"],
      lg: ["py-32"],
    },
    styles: {
      backgroundImage: {
        base: `linear-gradient(135deg, ${accent}, #020617)`,
      },
    },
    children: [
      {
        id: "agent-copy",
        type: "container",
        classNames: {
          base: ["mx-auto", "grid", "max-w-6xl", "gap-8"],
          md: ["grid-cols-2", "items-center"],
        },
        children: [
          {
            id: "agent-title",
            type: "heading",
            props: { text: title, level: 1 },
            classNames: { base: ["text-5xl", "font-black", "text-white"] },
            motion: {
              enabled: true,
              effects: ["fade", "slide-up"],
              trigger: "reveal",
              speed: "normal",
              easing: "smooth",
              distance: "md",
            },
          },
        ],
      },
    ],
  };
}

describe("designed sections", () => {
  it("parses a strict designed-section tool payload", () => {
    const parsed = ClientToolInsertDesignedSectionInputSchema.safeParse({
      node: createHeroNode("Design the page before the prompt cools", "#0891b2"),
      unexpected: true,
    });

    expect(parsed.success).toBe(false);
    expect(
      ClientToolInsertDesignedSectionInputSchema.safeParse({
        node: createHeroNode("Design the page before the prompt cools", "#0891b2"),
      }).success,
    ).toBe(true);
  });

  it("normalizes one valid model-authored section root", () => {
    const result = normalizeDesignedSectionNode(
      createHeroNode("Build a site that feels alive", "#0f766e"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(BuilderNodeSchema.safeParse(result.node).success).toBe(true);
    expect(result.node.type).toBe("section");
    expect(result.node.children[0]?.children[0]?.motion?.enabled).toBe(true);
  });

  it("rejects legacy class fields instead of migrating them", () => {
    const result = normalizeDesignedSectionNode({
      type: "section",
      props: { className: "rounded-3xl" },
      children: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(formatDesignedSectionIssues(result.issues)).toContain(
      "props.className",
    );
  });

  it("rejects non-section roots", () => {
    const result = normalizeDesignedSectionNode({
      type: "container",
      children: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(formatDesignedSectionIssues(result.issues)).toContain(
      "Designed sections must use a section root node",
    );
  });

  it("rejects empty section shells before they reach the canvas", () => {
    const result = normalizeDesignedSectionNode({
      type: "Section",
      children: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(formatDesignedSectionIssues(result.issues)).toContain(
      "designed section cannot be empty",
    );
  });

  it("does not require a prescribed container layout", () => {
    const result = normalizeDesignedSectionNode({
      type: "section",
      children: [
        {
          type: "heading",
          props: { text: "A valid direct child", level: 2 },
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it("rejects unknown element types with a repairable catalog error", () => {
    const result = normalizeDesignedSectionNode({
      type: "section",
      children: [
        {
          type: "container",
          children: [{ type: "card-grid", props: {} }],
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(formatDesignedSectionIssues(result.issues)).toContain(
      'Unknown canvas element type "card-grid"',
    );
  });

  it("canonicalizes provider-shaped nodes into a renderable section", () => {
    const result = normalizeDesignedSectionNode({
      type: "Section",
      children: [
        {
          type: "Container",
          children: [
            {
              type: "Text",
              props: { text: "Architecture & Design Studio" },
            },
            {
              type: "Heading",
              props: { level: 1, text: "Spaces that define modern living" },
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.node.children[0]?.type).toBe("container");
    expect(result.node.children[0]?.children[0]?.props).toEqual({
      content: "Architecture & Design Studio",
    });
  });

  it("regenerates IDs before insertion", () => {
    const result = normalizeDesignedSectionNode(
      createHeroNode("Ship original pages", "#7c3aed"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const regenerated = regenerateNodeTreeIds(result.node);
    expect(regenerated.id).toMatch(/^n_[a-z0-9]{8}$/);
    expect(regenerated.id).not.toBe("agent-root");
    expect(regenerated.children[0]?.id).toMatch(/^n_[a-z0-9]{8}$/);
    expect(regenerated.children[0]?.id).not.toBe("agent-copy");
  });

  it("does not depend on canned recipe labels or fixed backgrounds", () => {
    const result = normalizeDesignedSectionNode(
      createHeroNode("A launch wall for analytics teams", "#be123c"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const serialized = JSON.stringify(result.node);
    expect(serialized).not.toContain("Agent hero");
    expect(serialized).not.toContain("images.unsplash.com/photo-1497366754035");
    expect(serialized).toContain("A launch wall for analytics teams");
  });

  it("allows materially different authored structures", () => {
    const first = normalizeDesignedSectionNode(
      createHeroNode("Operational clarity in one view", "#0e7490"),
    );
    const second = normalizeDesignedSectionNode({
      id: "feature-root",
      type: "section",
      metadata: { label: "Signal grid" },
      classNames: {
        base: ["relative", "px-6", "py-20", "bg-zinc-950"],
      },
      children: [
        {
          id: "feature-grid",
          type: "container",
          classNames: {
            base: ["mx-auto", "grid", "max-w-7xl", "gap-4"],
            lg: ["grid-cols-3"],
          },
          children: ["Visual builder", "CMS wiring", "Deploy controls"].map(
            (label) => ({
              id: `feature-${label.toLowerCase().replaceAll(" ", "-")}`,
              type: "container",
              classNames: { base: ["rounded-lg", "border", "p-6"] },
              children: [
                {
                  type: "heading",
                  props: { text: label, level: 3 },
                },
              ],
            }),
          ),
        },
      ],
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(JSON.stringify(first.node)).not.toEqual(JSON.stringify(second.node));
    expect(first.node.children[0]?.children).toHaveLength(1);
    expect(second.node.children[0]?.children).toHaveLength(3);
  });
});
