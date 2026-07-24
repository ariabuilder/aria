import { describe, expect, it } from "vitest";

import {
  buildInspectorPropertyDefinition,
  resolveImageBindingSourceMode,
  resolveTextBindingPropName,
  resolveTextBindingSourceMode,
} from "../../../admin/features/Inspector/composables/useInspectorPropBinding";
import type { BuilderNode } from "../../../lib/types/nodes";

describe("useInspectorPropBinding helpers", () => {
  it("resolves heading text binding to synthetic text prop", () => {
    const node = {
      id: "heading-1",
      type: "heading",
      props: { level: 2 },
      styles: {},
      children: [{ id: "t", type: "text", props: { text: "Hello" }, styles: {}, children: [] }],
    } satisfies BuilderNode;

    expect(resolveTextBindingPropName(node)).toBe("text");
  });

  it("prefers explicit content prop names", () => {
    const node = {
      id: "text-1",
      type: "text",
      props: { content: "Body" },
      styles: {},
      children: [],
    } satisfies BuilderNode;

    expect(resolveTextBindingPropName(node)).toBe("content");
  });

  it("maps image binding state to collection source mode", () => {
    expect(
      resolveImageBindingSourceMode({
        isBound: true,
        src: "",
        isExternalUrl: false,
      }),
    ).toBe("collection");

    expect(
      resolveImageBindingSourceMode({
        isBound: false,
        src: "https://cdn.example.com/a.jpg",
        isExternalUrl: true,
      }),
    ).toBe("url");
  });

  it("maps text binding state to collection mode", () => {
    expect(
      resolveTextBindingSourceMode({
        isBound: true,
        isCollectionPending: false,
      }),
    ).toBe("collection");

    expect(
      resolveTextBindingSourceMode({
        isBound: false,
        isCollectionPending: false,
      }),
    ).toBe("static");
  });

  it("builds inspector property definitions", () => {
    expect(
      buildInspectorPropertyDefinition({
        name: "styles.backgroundImage",
        type: "string",
      }).name,
    ).toBe("styles.backgroundImage");
  });
});
