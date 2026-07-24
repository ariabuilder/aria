import { describe, expect, it } from "vitest";
import { generateNodeId, regenerateNodeTreeIds } from "../../lib/ids/nodeId";
import { NodeIdSchema } from "../../lib/schemas/nodes";
import type { BuilderNode } from "../../lib/types/nodes";

describe("nodeId", () => {
  it("generates short node IDs that match the shared schema", () => {
    const nodeId = generateNodeId();

    expect(nodeId).toMatch(/^n_[a-z0-9]{8}$/);
    expect(NodeIdSchema.safeParse(nodeId).success).toBe(true);
  });

  it("keeps legacy node IDs schema-compatible during the transition", () => {
    expect(
      NodeIdSchema.safeParse("c87d03f6-519c-42cb-b806-e38ad357369c").success,
    ).toBe(true);
    expect(NodeIdSchema.safeParse("node_1775750466072_wvwh7ofay").success).toBe(
      true,
    );
  });

  it("regenerates an entire node tree with new short IDs", () => {
    const source: BuilderNode = {
      id: "legacy-root",
      type: "container",
      props: { id: "hero-section" },
      styles: {},
      children: [
        {
          id: "legacy-child",
          type: "text",
          props: { content: "Hello", id: "hero-copy" },
          styles: {},
          children: [],
          customClasses: [],
        },
      ],
      customClasses: [],
    };

    const cloned = regenerateNodeTreeIds(source);

    expect(cloned.id).toMatch(/^n_[a-z0-9]{8}$/);
    expect(cloned.children[0]?.id).toMatch(/^n_[a-z0-9]{8}$/);
    expect(cloned.id).not.toBe(source.id);
    expect(cloned.children[0]?.id).not.toBe(source.children[0]?.id);
    expect(cloned.props?.id).toBeUndefined();
    expect(cloned.children[0]?.props?.id).toBeUndefined();
  });
});
