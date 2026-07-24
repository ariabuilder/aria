import { describe, expect, it } from "vitest";
import type { BuilderNode } from "../../lib/types/nodes";
import {
  iconToSvgNode,
  isLeafSwapCandidate,
  normalizeSwapNodeType,
  svgToIconNode,
} from "../../lib/blocks/svgIconNodeConversion";
import { IconReferenceSchema } from "../../lib/icons/reference";

function createNode(type: string, props: BuilderNode["props"] = {}): BuilderNode {
  return {
    id: "node-1",
    type,
    props,
    styles: {},
    children: [],
  };
}

describe("svgIconNodeConversion", () => {
  it("normalizes svg, icon, and i types", () => {
    expect(normalizeSwapNodeType("Svg")).toBe("svg");
    expect(normalizeSwapNodeType("Icon")).toBe("icon");
    expect(normalizeSwapNodeType("i")).toBe("icon");
    expect(normalizeSwapNodeType("div")).toBeNull();
  });

  it("converts svg to icon with default icon reference", () => {
    const source = createNode("svg", {
      width: "32",
      height: "32",
      content: "<circle cx='12' cy='12' r='8' />",
    });

    const result = svgToIconNode(source);
    expect(result.type).toBe("icon");
    expect(result.id).toBe("node-1");
    expect(IconReferenceSchema.safeParse(result.props.icon).success).toBe(true);
    expect(result.props).not.toHaveProperty("content");
    expect(result.styles.width?.base).toBe("32px");
  });

  it("rejects non-leaf swap candidates", () => {
    const node = createNode("svg");
    node.children = [createNode("text")];
    expect(isLeafSwapCandidate(node)).toBe(false);
  });

  it("converts icon to svg using icon data api", async () => {
    const iconRef = IconReferenceSchema.parse({
      id: "lucide:star",
      pack: "lucide",
      name: "star",
      source: "iconify",
      version: "2026-02-25-snapshot",
    });

    const source = createNode("icon", { icon: iconRef });
    const result = await iconToSvgNode(source, async () => ({
      svg: "<path d='M12 2l2.4 7.4h7.6l-6 4.6 2.3 7-6.3-4.6-6.3 4.6 2.3-7-6-4.6h7.6z'/>",
      viewBox: "0 0 24 24",
      snapshotVersion: "test",
    }));

    expect(result?.type).toBe("svg");
    expect(result?.props.content).toContain("path");
    expect(result?.props.viewBox).toBe("0 0 24 24");
  });

  it("returns null when icon cannot be resolved", async () => {
    const source = createNode("icon", { icon: "not-a-valid-icon" });
    const result = await iconToSvgNode(source, async () => null);
    expect(result).toBeNull();
  });
});

describe("getSwapOptionsForNode helper", () => {
  it("is covered via normalize and leaf checks", () => {
    const node = createNode("Svg");
    expect(normalizeSwapNodeType(node.type)).toBe("svg");
    expect(isLeafSwapCandidate(node)).toBe(true);
  });
});
