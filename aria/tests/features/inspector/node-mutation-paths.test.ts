import { describe, expect, it, vi } from "vitest";

vi.mock("astro:actions", () => ({
  actions: {
    mutate: vi.fn(),
  },
}));

describe("Inspector node mutation path mapping", () => {
  it("maps dataSource to a node-level mutation", async () => {
    const { buildNodeMutationUpdatesFromPath } = await import(
      "../../../admin/features/Inspector/composables/useNodeMutations"
    );

    const dataSource = {
      type: "collection" as const,
      collection: "blog",
      mode: "single" as const,
      bindings: {
        text: "blog.title",
      },
    };

    expect(buildNodeMutationUpdatesFromPath("dataSource", dataSource)).toEqual({
      dataSource,
    });
  });

  it("maps metadata to a node-level mutation", async () => {
    const { buildNodeMutationUpdatesFromPath } = await import(
      "../../../admin/features/Inspector/composables/useNodeMutations"
    );

    const metadata = {
      contentEditor: {
        fields: {
          text: {
            locked: true,
          },
        },
      },
    };

    expect(buildNodeMutationUpdatesFromPath("metadata", metadata)).toEqual({
      metadata,
    });
  });

  it("maps regular one-part paths to props", async () => {
    const { buildNodeMutationUpdatesFromPath } = await import(
      "../../../admin/features/Inspector/composables/useNodeMutations"
    );

    expect(buildNodeMutationUpdatesFromPath("title", "Hello")).toEqual({
      props: {
        title: "Hello",
      },
    });
  });

  it("hides reserved metadata props from the inspector bindings list", async () => {
    const { isVisibleInspectorBindingProp } = await import(
      "../../../admin/features/Inspector/composables/usePropsEditor"
    );

    expect(isVisibleInspectorBindingProp("metadata")).toBe(false);
    expect(isVisibleInspectorBindingProp("title")).toBe(true);
  });

  it("rejects invalid node-level dataSource payloads", async () => {
    const { buildNodeMutationUpdatesFromPath } = await import(
      "../../../admin/features/Inspector/composables/useNodeMutations"
    );

    expect(
      buildNodeMutationUpdatesFromPath("dataSource", {
        type: "collection",
        collection: "blog",
        mode: "wat",
      }),
    ).toBeNull();
  });

  it("maps absent previous dataSource values to a clear mutation", async () => {
    const { buildNodeMutationUpdatesFromPath } = await import(
      "../../../admin/features/Inspector/composables/useNodeMutations"
    );

    expect(buildNodeMutationUpdatesFromPath("dataSource", undefined)).toEqual({
      dataSource: null,
    });
    expect(buildNodeMutationUpdatesFromPath("dataSource", null)).toEqual({
      dataSource: null,
    });
  });
});
