/**
 * Active slot placement and ownership for page and layout editing.
 */

import { computed, ref, watch, type Ref } from "vue";
import type { LayoutDSL } from "../../../../lib/types/nodes";
import {
  ActiveLayoutSlotSchema,
  type ActiveLayoutSlot,
} from "../../../../lib/schemas/slotEditing";
import {
  createDefaultActiveSlot,
  getEditorSlotScope,
  type LayoutWithSlotsLike,
} from "../../../../lib/layouts/slotEditing";
import { getLayoutDefaultSlotName } from "../../../../lib/layouts/resolveNodeSlot";

export const ACTIVE_LAYOUT_SLOT_KEY = Symbol("aria.activeLayoutSlot");

export interface UseActiveLayoutSlotOptions {
  currentLayout: Ref<LayoutDSL | null>;
  currentItemType: Ref<"page" | "layout" | "component">;
}

export interface EnterLayoutSlotOptions {
  /** Layout snapshot from the layers panel when app state may lag behind props. */
  layout?: LayoutWithSlotsLike | LayoutDSL | null;
}

export function useActiveLayoutSlot(options: UseActiveLayoutSlotOptions) {
  const { currentLayout, currentItemType } = options;

  const activeSlot = ref<ActiveLayoutSlot>(
    createDefaultActiveSlot(currentLayout.value),
  );

  const activeSlotScope = computed(() =>
    getEditorSlotScope(
      currentItemType.value,
      activeSlot.value.name,
      currentLayout.value,
    ),
  );

  const activeSlotLabel = computed(() => {
    const slotName = activeSlot.value.name;
    const slot = currentLayout.value?.slots?.find((s) => s.name === slotName);
    return slot?.label ?? slotName;
  });

  const isLayoutSlotEditing = computed(
    () =>
      activeSlotScope.value === "layout" &&
      Boolean(currentLayout.value?.slots?.length),
  );

  function syncActiveSlotToLayout(): void {
    const defaultSlot = createDefaultActiveSlot(currentLayout.value);
    activeSlot.value = ActiveLayoutSlotSchema.parse({
      name: defaultSlot.name,
      scope: defaultSlot.scope,
      layoutId: currentLayout.value?.id,
    });
  }

  function enterSlot(
    slotName: string,
    enterOptions: EnterLayoutSlotOptions = {},
  ): void {
    const layout = (enterOptions.layout ??
      currentLayout.value) as LayoutWithSlotsLike | null;
    const nextScope = getEditorSlotScope(
      currentItemType.value,
      slotName,
      layout,
    );

    activeSlot.value = ActiveLayoutSlotSchema.parse({
      name: slotName,
      scope: nextScope,
      layoutId: layout?.id ?? currentLayout.value?.id,
    });
  }

  function setActiveSlot(
    slotName: string,
    enterOptions?: EnterLayoutSlotOptions,
  ): void {
    enterSlot(slotName, enterOptions);
  }

  function resetToPageScope(): void {
    syncActiveSlotToLayout();
  }

  watch(
    () => currentLayout.value?.id,
    () => {
      syncActiveSlotToLayout();
    },
  );

  const defaultSlotName = computed(() =>
    getLayoutDefaultSlotName(currentLayout.value),
  );

  return {
    activeSlot,
    activeSlotScope,
    activeSlotLabel,
    isLayoutSlotEditing,
    defaultSlotName,
    enterSlot,
    setActiveSlot,
    resetToPageScope,
    syncActiveSlotToLayout,
  };
}

export type UseActiveLayoutSlotReturn = ReturnType<typeof useActiveLayoutSlot>;
