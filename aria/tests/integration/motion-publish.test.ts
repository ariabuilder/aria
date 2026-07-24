import { describe, expect, it } from "vitest";

import { compileMotionClassString } from "../../lib/motion/compile/compileMotionClasses";
import {
  nodeTreeRequiresMotionStyles,
  nodeTreeRequiresMotionRuntime,
  renderMotionStyleTag,
  renderMotionScriptTag,
} from "../../lib/motion/runtime";
import type { BuilderNode } from "../../lib/types/nodes";

function createNode(partial: Partial<BuilderNode> = {}): BuilderNode {
  return {
    id: "node-1",
    type: "Container",
    props: {},
    styles: {},
    children: [],
    ...partial,
  };
}

describe("motion publish integration", () => {
  it("compiles classes for enabled motion", () => {
    expect(
      compileMotionClassString({
        enabled: true,
        effects: ["fade"],
        trigger: "reveal",
      }),
    ).toBe("aria-motion aria-motion-fade aria-motion-reveal");
  });

  it("requires runtime for reveal triggers", () => {
    const nodes = [
      createNode({
        motion: {
          enabled: true,
          effects: ["fade"],
          trigger: "reveal",
        },
      }),
    ];

    expect(nodeTreeRequiresMotionRuntime(nodes)).toBe(true);
  });

  it("requires motion styles for enabled motion", () => {
    const nodes = [
      createNode({
        motion: {
          enabled: true,
          effects: ["fade"],
          trigger: "hover",
        },
      }),
    ];

    expect(nodeTreeRequiresMotionStyles(nodes)).toBe(true);
  });

  it("skips runtime for hover-only CSS motion", () => {
    const nodes = [
      createNode({
        motion: {
          enabled: true,
          effects: ["fade"],
          trigger: "hover",
        },
      }),
    ];

    expect(nodeTreeRequiresMotionRuntime(nodes)).toBe(false);
    expect(nodeTreeRequiresMotionStyles(nodes)).toBe(true);
  });

  it("requires styles and runtime for enabled parallax", () => {
    const nodes = [
      createNode({
        motion: {
          enabled: false,
          effects: [],
          trigger: "reveal",
          parallax: {
            enabled: true,
            speed: "1",
            direction: "up",
            effects: [],
            travel: 120,
            anchor: "center",
            velocity: false,
            disableOnMobile: false,
          },
        },
      }),
    ];

    expect(nodeTreeRequiresMotionStyles(nodes)).toBe(true);
    expect(nodeTreeRequiresMotionRuntime(nodes)).toBe(true);
  });

  it("renders the self-hosted motion stylesheet tag", () => {
    expect(renderMotionStyleTag()).toMatch(
      /^<style data-aria-motion="true">[\s\S]*<\/style>$/,
    );
  });

  it("renders self-hosted runtime script tag", () => {
    expect(renderMotionScriptTag()).toBe(
      '<script src="/vendor/aria-motion/aria-motion.js" defer></script>',
    );
  });
});
