import { watch, type MaybeRefOrGetter, toValue } from "vue";
import type { EditableItemType } from "../../Core/types/router";
import { useInspector } from "./useInspector";

function itemTypeToCollection(
  itemType: EditableItemType,
): "pages" | "layouts" | "components" {
  if (itemType === "page") {
    return "pages";
  }
  if (itemType === "layout") {
    return "layouts";
  }
  return "components";
}

/**
 * Keeps the shared inspector mutation target in sync with the active document.
 * Call from a shell that stays mounted while the stage/composer is open.
 */
export function useInspectorDocumentPath(
  itemType: MaybeRefOrGetter<EditableItemType | undefined>,
  itemSlug: MaybeRefOrGetter<string | undefined>,
): void {
  const inspector = useInspector();

  watch(
    () => [toValue(itemType), toValue(itemSlug)] as const,
    ([type, slug]) => {
      if (type && slug) {
        inspector.setDocumentPath(itemTypeToCollection(type), slug);
      }
    },
    { immediate: true },
  );
}
