import { describe, expect, it } from "vitest";

import { ref, type Ref } from "vue";
import type { BuilderNode } from "../../../../lib/types/nodes";
import { useMotionEditorState } from "../../../../admin/features/Inspector/motion/composables/useMotionEditorState";
import { applyPreset } from "../../../../admin/features/Inspector/motion/presets/catalog";

function builderNodeRef(node: BuilderNode): Ref<BuilderNode> {
  return ref(node as unknown) as Ref<BuilderNode>;
}

describe("useMotionEditorState", () => {
  it("tracks dirty state and resets draft", () => {
    const node = builderNodeRef({
      id: "node-1",
      type: "Container",
      props: {},
      styles: {},
      children: [],
      motion: {
        enabled: false,
        effects: [],
        trigger: "reveal",
      },
    });

    const editor = useMotionEditorState(node);
    expect(editor.isDirty()).toBe(false);

    editor.setDraft(applyPreset("fade-up"));
    expect(editor.isDirty()).toBe(true);

    editor.resetDraft();
    expect(editor.isDirty()).toBe(false);
    expect(editor.draft.value.enabled).toBe(false);
  });
});
