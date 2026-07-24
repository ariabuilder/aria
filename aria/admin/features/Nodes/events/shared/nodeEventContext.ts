import type { Ref } from "vue";
import type {
  ComponentDSL,
  LayoutDSL,
  PageDSL,
} from "../../../../../lib/types/nodes";

export type EditableItemType = "page" | "layout" | "component";

export interface NodeEventMutationContext {
  currentPage: Ref<PageDSL | null>;
  currentComponent: Ref<ComponentDSL | null>;
  currentItemType: Ref<EditableItemType>;
}

export const resolveMutationPath = (
  context: NodeEventMutationContext,
): { collection: "pages" | "layouts" | "components"; id: string } | null => {
  const pageId = context.currentPage.value?.id;
  const componentId = context.currentComponent.value?.id;

  if (
    context.currentItemType.value === "page" ||
    context.currentItemType.value === "layout"
  ) {
    if (!pageId) {
      return null;
    }
  }

  if (
    context.currentItemType.value === "component" &&
    !componentId &&
    !pageId
  ) {
    return null;
  }

  const collection =
    context.currentItemType.value === "page"
      ? "pages"
      : context.currentItemType.value === "layout"
        ? "layouts"
        : "components";

  const id =
    context.currentItemType.value === "component"
      ? (componentId ?? pageId ?? "")
      : (pageId ?? "");

  return { collection, id };
};

export const createDefaultSlotNameResolver = (
  currentLayout: Ref<LayoutDSL | null>,
): (() => string) => {
  return () => {
    const slots = currentLayout.value?.slots;
    if (!slots || slots.length === 0) return "default";
    return (
      slots.find((slot) => slot.isDefault)?.name || slots[0]?.name || "default"
    );
  };
};
