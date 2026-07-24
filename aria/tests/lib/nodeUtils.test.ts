import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cloneNode,
  expandComponentReferences,
  expandComponentReferencesServer,
} from "../../lib/blocks/nodeUtils";
import type { BuilderNode } from "../../lib/types/nodes";

function createNode(overrides: Partial<BuilderNode>): BuilderNode {
  return {
    id: overrides.id || "node-1",
    type: overrides.type || "Container",
    props: overrides.props || {},
    styles: overrides.styles || {},
    children: overrides.children || [],
    ...overrides,
  };
}

describe("nodeUtils", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("does not throw when client component references only use props.componentId", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    const node = createNode({
      id: "component-node",
      type: "Component",
      props: { componentId: "missing-component" },
    });

    await expect(expandComponentReferences([node])).resolves.toEqual([node]);
  });

  it("guards against recursive server-side component expansion", async () => {
    const getComponentDSL = vi.fn().mockResolvedValue({
      nodes: [
        createNode({
          id: "nested-component",
          type: "Component",
          props: { componentId: "self-ref" },
        }),
      ],
    });

    const result = await expandComponentReferencesServer(
      [
        createNode({
          id: "root-component",
          type: "Component",
          props: { componentId: "self-ref" },
        }),
      ],
      getComponentDSL,
    );

    expect(result[0].type).toBe("Container");
    expect(result[0].children[0].type).toBe("Container");
    expect(result[0].children[0].children[0].props.text).toContain(
      "Circular reference detected: self-ref",
    );
  });

  it("deep clones nested responsive style maps", () => {
    const original = createNode({
      id: "styled-node",
      styles: {
        padding: {
          base: "1rem",
          md: "2rem",
        },
      },
    });

    const cloned = cloneNode(original);
    (cloned.styles.padding as Record<string, string>).md = "4rem";

    expect((original.styles.padding as Record<string, string>).md).toBe("2rem");
    expect((cloned.styles.padding as Record<string, string>).md).toBe("4rem");
  });
});
