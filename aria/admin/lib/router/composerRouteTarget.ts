import type { LocationQuery } from "vue-router";
import type { EditableItemType } from "@/features/Core/types/router";
import { normalizeEditorSlug } from "@/lib/editor/slugs";

export interface ComposerRouteTarget {
  readonly itemType: EditableItemType;
  readonly itemSlug: string;
}

const COLLECTION_TO_ITEM_TYPE: Record<string, EditableItemType> = {
  pages: "page",
  layouts: "layout",
  components: "component",
};

/**
 * Parse `/pages/:slug?composer` (and layout/component equivalents) from route state.
 */
export function parseComposerRouteTarget(
  path: string,
  query: LocationQuery | Record<string, unknown>,
): ComposerRouteTarget | null {
  if (!("composer" in query)) {
    return null;
  }

  const parts = path.split("/").filter(Boolean);
  if (parts.length < 2 || parts[0] === "new") {
    return null;
  }

  const itemType = COLLECTION_TO_ITEM_TYPE[parts[0]];
  if (!itemType) {
    return null;
  }

  const itemSlug = parts[1];
  if (!itemSlug) {
    return null;
  }

  return {
    itemType,
    itemSlug: normalizeEditorSlug(itemSlug),
  };
}

export function buildComposerPath(
  itemType: EditableItemType,
  itemSlug: string,
): string {
  return `/${itemType}s/${normalizeEditorSlug(itemSlug)}?composer`;
}
