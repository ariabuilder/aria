import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import { invalidateComposeCache } from "@/composables/composeClientCache";
import { isForbiddenActionError } from "@/lib/actionErrors";
import {
  migratePageRootNodeSlots,
  type LayoutSlotRef,
} from "../../../../../lib/layouts/resolveNodeSlot";
import { normalizePageLayoutRef } from "../../../../../lib/pages/layoutPolicy";
import { isJsonObject } from "@/lib/types/nodes";
import type { BuilderNode, PageDSL } from "@/lib/types/nodes";

export const LAYOUT_CHANGE_FORBIDDEN_MESSAGE =
  "You do not have permission to change page layout.";

export interface UpdatePageLayoutResult {
  success: boolean;
  nextPage?: PageDSL;
  previousLayout?: string;
  nextLayout?: string;
}

export async function updatePageLayout(options: {
  page: PageDSL;
  nextLayoutSlug: string;
  canEdit: boolean;
  /** When provided, root node slots are normalized for the target layout. */
  nextLayoutSlots?: LayoutSlotRef[];
}): Promise<UpdatePageLayoutResult> {
  const { page, nextLayoutSlug, canEdit, nextLayoutSlots } = options;

  if (!page.slug) {
    return { success: false };
  }

  if (!canEdit) {
    toast.error(LAYOUT_CHANGE_FORBIDDEN_MESSAGE);
    return { success: false };
  }

  const nextLayout = normalizePageLayoutRef(nextLayoutSlug);
  const previousLayout = normalizePageLayoutRef(page.layout);

  if (previousLayout === nextLayout) {
    return { success: true, nextPage: page, previousLayout, nextLayout };
  }

  let layoutSlots = nextLayoutSlots;
  if (nextLayout && !layoutSlots?.length) {
    const { data: layoutData } = await actions.getItem({
      collection: "layouts",
      slug: nextLayout,
    });
    if (
      layoutData &&
      typeof layoutData === "object" &&
      "slots" in layoutData &&
      Array.isArray((layoutData as { slots?: LayoutSlotRef[] }).slots)
    ) {
      layoutSlots = (layoutData as { slots: LayoutSlotRef[] }).slots;
    }
  }

  const migratedNodes =
    layoutSlots?.length && page.nodes?.length
      ? (migratePageRootNodeSlots(page.nodes, {
          slots: layoutSlots,
        }) as BuilderNode[])
      : page.nodes;

  const nextPage: PageDSL = {
    ...page,
    layout: nextLayout,
    nodes: migratedNodes,
    updatedAt: new Date().toISOString(),
  };

  const serialized: unknown = JSON.parse(JSON.stringify(nextPage));
  if (!isJsonObject(serialized)) {
    toast.error("Failed to update layout");
    return { success: false, previousLayout, nextLayout };
  }

  const { data, error } = await actions.updateItem({
    collection: "pages",
    slug: page.slug,
    data: serialized,
  });

  if (error) {
    if (isForbiddenActionError(error)) {
      toast.error(LAYOUT_CHANGE_FORBIDDEN_MESSAGE);
    } else {
      toast.error("Failed to update layout");
    }
    return { success: false, previousLayout, nextLayout };
  }

  void data;
  invalidateComposeCache("page", page.slug);

  return { success: true, nextPage, previousLayout, nextLayout };
}
