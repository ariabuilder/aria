import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import type { LayoutDSL } from "@/lib/types/nodes";
import { log } from "@/lib/utils/logger";
import { unwrapStudioCrudGetItemResult } from "./studioCrudActionResults";
import {
  createStudioCrudContext,
  RenameLayoutInputSchema,
  CreateLayoutInputSchema,
  SlugSchema,
  type StudioCrudContext,
} from "./studioCrudShared";

export function useStudioLayoutCrud(ctx: StudioCrudContext = createStudioCrudContext()) {
  const {
    builderData,
    recordCreateItem,
    recordDeleteItem,
    recordUpdateItem,
    isItemLoading,
    generateUniqueSlug,
    toActionData,
  } = ctx;

async function fetchLayout(slug: string): Promise<LayoutDSL | null> {
    const parsedSlug = SlugSchema.safeParse(slug);
    if (!parsedSlug.success) {
      return null;
    }

    const result = unwrapStudioCrudGetItemResult(
      "layouts",
      await actions.getItem({
        collection: "layouts",
        slug: parsedSlug.data,
      }),
      "Failed to load layout",
      {
        slug,
        source: "useStudioActions.fetchLayout",
      },
    );

    if (!result.success) {
      return null;
    }

    return result.data;
  }

async function loadLayoutForEditing(slug: string) {
    isItemLoading.value = true;
    try {
      const layout = await fetchLayout(slug);
      if (!layout) {
        throw new Error("Layout not found");
      }
      toast.success(`Loaded layout: ${slug}`);
    } catch (error) {
      log("error", "[Studio] Failed to load layout", {
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Failed to load layout");
      throw error;
    } finally {
      isItemLoading.value = false;
    }
  }

async function createLayout(
    name: string = "New Layout",
  ): Promise<string | null> {
    const parsedName = CreateLayoutInputSchema.safeParse(name);
    if (!parsedName.success) {
      toast.error("Invalid layout name");
      return null;
    }

    const trimmedName = parsedName.data;
    const existingSlugs = builderData.layouts.value.map((l) => l.id);
    const uniqueSlug = generateUniqueSlug(trimmedName, existingSlugs);

    const layoutData: LayoutDSL = {
      id: uniqueSlug,
      name: trimmedName,
      description: "",
      nodes: [],
      slots: [],
      metadata: {},
      layoutMetadata: {},
      settings: {},
      updatedAt: new Date().toISOString(),
    };

    const createdSlug = await recordCreateItem({
      type: "create-layout",
      description: `Create layout "${trimmedName}"`,
      collection: "layouts",
      slug: uniqueSlug,
      data: toActionData(layoutData),
      refresh: builderData.refreshLayouts,
    });

    if (createdSlug) {
      toast.success(`Created layout: ${trimmedName}`);
    }

    return createdSlug;
  }

async function renameLayout(slug: string, newName: string): Promise<boolean> {
    const parsedInput = RenameLayoutInputSchema.safeParse({ slug, newName });
    if (!parsedInput.success) {
      toast.error("Invalid layout rename request");
      return false;
    }

    const { slug: targetSlug, newName: trimmedName } = parsedInput.data;
    const fullLayout = await fetchLayout(targetSlug);
    if (!fullLayout) {
      toast.error("Failed to fetch layout for rename");
      return false;
    }

    const oldName = fullLayout.name || targetSlug;
    if (oldName === trimmedName) {
      return false;
    }

    const renamed = await recordUpdateItem({
      type: "rename-layout",
      description: `Rename layout "${oldName}" to "${trimmedName}"`,
      collection: "layouts",
      slug: targetSlug,
      data: toActionData({
        ...fullLayout,
        name: trimmedName,
        title: trimmedName,
        updatedAt: new Date().toISOString(),
      }),
      restoreData: toActionData({
        ...fullLayout,
        name: oldName,
        title: fullLayout.title,
        updatedAt: new Date().toISOString(),
      }),
      refresh: builderData.refreshLayouts,
    });

    if (renamed) {
      toast.success(`Renamed layout to "${trimmedName}"`);
    }

    return renamed;
  }

async function duplicateLayout(slug: string): Promise<string | null> {
    const fullLayout = await fetchLayout(slug);
    if (!fullLayout) {
      toast.error("Failed to fetch layout for duplication");
      return null;
    }

    const baseName = `${fullLayout.name || slug} Copy`;
    const existingSlugs = builderData.layouts.value.map((l) => l.id);
    const uniqueSlug = generateUniqueSlug(baseName, existingSlugs);

    const duplicatedData: LayoutDSL = {
      ...fullLayout,
      id: uniqueSlug,
      name: baseName,
      updatedAt: new Date().toISOString(),
    };

    const createdSlug = await recordCreateItem({
      type: "duplicate-layout",
      description: `Duplicate layout "${fullLayout.name || slug}"`,
      collection: "layouts",
      slug: uniqueSlug,
      data: toActionData(duplicatedData),
      refresh: builderData.refreshLayouts,
    });

    if (createdSlug) {
      toast.success(`Duplicated layout: ${baseName}`);
    }

    return createdSlug;
  }

async function deleteLayout(slug: string): Promise<boolean> {
    const fullLayout = await fetchLayout(slug);
    if (!fullLayout) {
      toast.error("Failed to fetch layout for deletion");
      return false;
    }

    const layoutName = fullLayout.name || slug;
    const deleted = await recordDeleteItem({
      type: "delete-layout",
      description: `Delete layout "${layoutName}"`,
      collection: "layouts",
      slug,
      restoreData: toActionData(fullLayout),
      refresh: builderData.refreshLayouts,
    });

    if (deleted) {
      toast.success(`Deleted layout: ${layoutName}`);
    }

    return deleted;
  }

  function isLoadingLayout(): boolean {
    return isItemLoading.value === true;
  }

  return {
    loadLayoutForEditing,
    createLayout,
    renameLayout,
    duplicateLayout,
    deleteLayout,
    isLoadingLayout,
  };
}
