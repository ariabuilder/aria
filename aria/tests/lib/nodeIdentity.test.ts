import { describe, expect, it } from "vitest";
import {
  collectNodeIds,
  createNodeIdentityFingerprint,
  ensureUniqueNodeIdentities,
} from "../../lib/blocks/nodeIdentity";
import type { BuilderNode } from "../../lib/types/nodes";

const node = (
  id: string,
  children: BuilderNode[] = [],
  styles: BuilderNode["styles"] = {},
): BuilderNode => ({
  id,
  type: "Container",
  props: {},
  styles,
  children,
});

describe("node identity integrity", () => {
  it("preserves references when every identity is already unique", () => {
    const child = node("child");
    const root = node("root", [child]);

    const result = ensureUniqueNodeIdentities([root]);

    expect(result.repairs).toEqual([]);
    expect(result.nodes[0]).toBe(root);
    expect(result.nodes[0]?.children?.[0]).toBe(child);
  });

  it("repairs only later duplicate occurrences in deterministic tree order", () => {
    const generatedIds = ["generated-container", "generated-heading"];
    const roots = [
      node("section-a", [node("shared-container", [node("shared-heading")])]),
      node("section-b", [node("shared-container", [node("shared-heading")])]),
    ];

    const result = ensureUniqueNodeIdentities(roots, {
      createId: () => generatedIds.shift() ?? "unused-generated-id",
    });

    expect(result.nodes[0]).toBe(roots[0]);
    expect(result.nodes[1]?.children?.[0]?.id).toBe("generated-container");
    expect(result.nodes[1]?.children?.[0]?.children?.[0]?.id).toBe(
      "generated-heading",
    );
    expect(result.repairs).toEqual([
      {
        previousId: "shared-container",
        nextId: "generated-container",
        path: [1, 0],
      },
      {
        previousId: "shared-heading",
        nextId: "generated-heading",
        path: [1, 0, 0],
      },
    ]);
  });

  it("regenerates insertion identities that collide with reserved content", () => {
    const reservedIds = collectNodeIds([
      node("existing-section", [node("existing-container")]),
    ]);
    const generatedIds = ["new-section", "new-container"];

    const result = ensureUniqueNodeIdentities(
      [node("existing-section", [node("existing-container")])],
      {
        reservedIds,
        createId: () => generatedIds.shift() ?? "unused-generated-id",
      },
    );

    expect(result.nodes[0]?.id).toBe("new-section");
    expect(result.nodes[0]?.children?.[0]?.id).toBe("new-container");
    expect(result.usedIds.size).toBe(4);
  });

  it("tracks identity structure without reacting to presentation styles", () => {
    const first = [
      node("section", [node("container")], { color: { base: "red" } }),
    ];
    const styleOnlyChange = [
      node("section", [node("container")], { color: { base: "blue" } }),
    ];
    const identityChange = [
      node("section", [node("different-container")], {
        color: { base: "blue" },
      }),
    ];

    expect(createNodeIdentityFingerprint([first])).toBe(
      createNodeIdentityFingerprint([styleOnlyChange]),
    );
    expect(createNodeIdentityFingerprint([first])).not.toBe(
      createNodeIdentityFingerprint([identityChange]),
    );
  });
});
