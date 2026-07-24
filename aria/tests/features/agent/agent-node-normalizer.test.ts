import { describe, expect, it } from "vitest";
import {
  formatAgentNodeNormalizationIssues,
  normalizeAgentNodeForInsert,
} from "../../../lib/blocks/agentNodeNormalizer";

describe("agent node normalizer", () => {
  it("fills required node defaults before strict BuilderNode validation", () => {
    const result = normalizeAgentNodeForInsert({
      type: "section",
      children: [
        {
          type: "heading",
          props: { text: "A stronger hero", level: 1 },
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.node.id).toMatch(/^n_[a-z0-9]{8}$/);
    expect(result.node.props).toEqual({});
    expect(result.node.styles).toEqual({});
    expect(result.node.classNames).toEqual({});
    expect(result.node.customClasses).toEqual([]);
    expect(result.node.children[0]?.id).toMatch(/^n_[a-z0-9]{8}$/);
  });

  it("coerces scalar styles into responsive base values", () => {
    const result = normalizeAgentNodeForInsert({
      type: "heading",
      props: { text: "World class", level: 1 },
      styles: {
        fontSize: "clamp(3rem, 8vw, 7rem)",
        opacity: 0.92,
        lineHeight: { base: 1, md: "0.95" },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.node.styles).toMatchObject({
      fontSize: { base: "clamp(3rem, 8vw, 7rem)" },
      opacity: { base: "0.92" },
      lineHeight: { base: "1", md: "0.95" },
    });
  });

  it("canonicalizes provider-cased element names and text aliases", () => {
    const result = normalizeAgentNodeForInsert({
      type: "Section",
      children: [
        {
          type: "Text",
          props: { text: "Live canvas copy" },
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.node.type).toBe("section");
    expect(result.node.children[0]?.type).toBe("text");
    expect(result.node.children[0]?.props).toEqual({
      content: "Live canvas copy",
    });
  });

  it("migrates legacy className fields into classNames.base", () => {
    const result = normalizeAgentNodeForInsert({
      type: "button",
      props: {
        text: "Start building",
        className: "rounded-full px-6",
      },
      classNames: {
        base: ["font-semibold"],
        md: "text-lg",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.node.props).not.toHaveProperty("className");
    expect(result.node.classNames).toEqual({
      base: ["font-semibold", "rounded-full", "px-6"],
      md: ["text-lg"],
    });
  });

  it("returns precise issue paths for invalid agent-shaped nodes", () => {
    const result = normalizeAgentNodeForInsert({
      type: "section",
      children: [
        {
          type: "heading",
          props: { text: "Broken" },
          classNames: { base: ["text-white", 42] },
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(formatAgentNodeNormalizationIssues(result.issues)).toContain(
      "children.0.classNames.base.1",
    );
  });
});
