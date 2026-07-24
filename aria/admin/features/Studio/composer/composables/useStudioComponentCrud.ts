import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import type { ComponentDSL } from "@/lib/types/nodes";
import { log } from "@/lib/utils/logger";
import {
  unwrapStudioCrudGetItemResult,
} from "./studioCrudActionResults";
import {
  createStudioCrudContext,
  CreateComponentOptionsSchema,
  RenameComponentInputSchema,
  SlugSchema,
  type BulkDeleteResult,
  type CreateComponentOptions,
  type StudioCrudContext,
  type StudioDeleteOptions,
} from "./studioCrudShared";

export function useStudioComponentCrud(ctx: StudioCrudContext = createStudioCrudContext()) {
  const {
    builderData,
    recordCreateItem,
    recordDeleteItem,
    recordDeleteItemsBatch,
    recordUpdateItem,
    isItemLoading,
    generateUniqueSlug,
    toActionData,
  } = ctx;

async function fetchComponent(id: string): Promise<ComponentDSL | null> {
    const parsedId = SlugSchema.safeParse(id);
    if (!parsedId.success) {
      return null;
    }

    const result = unwrapStudioCrudGetItemResult(
      "components",
      await actions.getItem({
        collection: "components",
        slug: parsedId.data,
      }),
      "Failed to load component",
      {
        id,
        source: "useStudioActions.fetchComponent",
      },
    );

    if (!result.success) {
      return null;
    }

    return result.data;
  }

async function loadComponentForEditing(id: string) {
    isItemLoading.value = true;
    try {
      const component = await fetchComponent(id);
      if (!component) {
        throw new Error("Component not found");
      }
      toast.success(`Loaded component: ${id}`);
    } catch (error) {
      log("error", "[Studio] Failed to load component", {
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Failed to load component");
      throw error;
    } finally {
      isItemLoading.value = false;
    }
  }

async function createComponent(
    options: CreateComponentOptions = {},
  ): Promise<string | null> {
    const parsedOptions = CreateComponentOptionsSchema.safeParse(options);
    if (!parsedOptions.success) {
      toast.error("Invalid component options");
      return null;
    }

    const {
      name = "New Component",
      slug: providedSlug,
      description = "",
      category = "",
    } = parsedOptions.data;

    const existingSlugs = builderData.components.value.map((c) => c.id);
    const uniqueSlug =
      providedSlug && !existingSlugs.includes(providedSlug)
        ? providedSlug
        : generateUniqueSlug(name, existingSlugs);

    const componentData: ComponentDSL = {
      id: uniqueSlug,
      name,
      description,
      category,
      nodes: [],
      settings: {},
      updatedAt: new Date().toISOString(),
    };

    const createdSlug = await recordCreateItem({
      type: "create-component",
      description: `Create component "${name}"`,
      collection: "components",
      slug: uniqueSlug,
      data: toActionData(componentData),
      refresh: builderData.refreshComponents,
    });

    if (createdSlug) {
      toast.success(`Created component: ${name}`);
    }

    return createdSlug;
  }

async function duplicateComponent(id: string): Promise<string | null> {
    const fullComponent = await fetchComponent(id);
    if (!fullComponent) {
      toast.error("Failed to fetch component for duplication");
      return null;
    }

    const baseName = `${fullComponent.name || id} Copy`;
    const existingSlugs = builderData.components.value.map((c) => c.id);
    const uniqueSlug = generateUniqueSlug(baseName, existingSlugs);

    const sourceComponent = fullComponent;

    const duplicatedData: ComponentDSL = {
      ...sourceComponent,
      id: uniqueSlug,
      name: baseName,
      source: "custom",
      tier: undefined,
      isLocked: false,
      packId: undefined,
      settings:
        sourceComponent.source === "aria"
          ? {
              ...(sourceComponent.settings ?? {}),
              copiedFromAriaComponentId: sourceComponent.id,
            }
          : sourceComponent.settings,
      updatedAt: new Date().toISOString(),
    };

    const createdSlug = await recordCreateItem({
      type: "duplicate-component",
      description: `Duplicate component "${sourceComponent.name || id}"`,
      collection: "components",
      slug: uniqueSlug,
      data: toActionData(duplicatedData),
      refresh: builderData.refreshComponents,
    });

    if (createdSlug) {
      toast.success(`Duplicated component: ${baseName}`);
    }

    return createdSlug;
  }

async function renameComponent(
    id: string,
    newName: string,
  ): Promise<boolean> {
    const parsedInput = RenameComponentInputSchema.safeParse({ id, newName });
    if (!parsedInput.success) {
      toast.error("Invalid component rename input");
      return false;
    }

    const fullComponent = await fetchComponent(id);
    if (!fullComponent) {
      toast.error("Failed to fetch component for rename");
      return false;
    }

    const oldName = fullComponent.name || id;
    const trimmedName = parsedInput.data.newName;

    if (!trimmedName) {
      toast.error("Component name cannot be empty");
      return false;
    }

    if (trimmedName === oldName) {
      return true;
    }

    const renamed = await recordUpdateItem({
      type: "rename-component",
      description: `Rename component "${oldName}" to "${trimmedName}"`,
      collection: "components",
      slug: parsedInput.data.id,
      data: toActionData({
        ...fullComponent,
        name: trimmedName,
        updatedAt: new Date().toISOString(),
      }),
      restoreData: toActionData({
        ...fullComponent,
        name: oldName,
        updatedAt: new Date().toISOString(),
      }),
      refresh: builderData.refreshComponents,
    });

    if (renamed) {
      toast.success(`Renamed to "${trimmedName}"`);
    }

    return renamed;
  }

async function deleteComponent(
    id: string,
    options: StudioDeleteOptions = {},
  ): Promise<boolean> {
    const fullComponent = await fetchComponent(id);
    if (!fullComponent) {
      toast.error("Failed to fetch component for deletion");
      return false;
    }

    const componentName = fullComponent.name || id;
    const deleted = await recordDeleteItem({
      type: "delete-component",
      description: `Delete component "${componentName}"`,
      collection: "components",
      slug: id,
      restoreData: toActionData(fullComponent),
      refresh: builderData.refreshComponents,
    });

    if (deleted && !options.silent) {
      toast.success(`Deleted component: ${componentName}`);
    }

    return deleted;
  }

async function deleteComponentsBatch(
    ids: string[],
    options: StudioDeleteOptions = {},
  ): Promise<BulkDeleteResult> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) {
      return { succeeded: 0, failed: 0, errors: [] };
    }

    const errors: string[] = [];
    const fetchResults = await Promise.all(
      uniqueIds.map(async (id) => ({
        id,
        fullComponent: await fetchComponent(id),
      })),
    );

    const items = fetchResults.flatMap(({ id, fullComponent }) => {
      if (!fullComponent) {
        errors.push(`${id}: Failed to fetch component for deletion`);
        return [];
      }

      return [{ slug: id, restoreData: toActionData(fullComponent) }];
    });

    if (items.length === 0) {
      return {
        succeeded: 0,
        failed: uniqueIds.length,
        errors,
      };
    }

    const description =
      items.length === 1
        ? `Delete component "${items[0]?.slug ?? "component"}"`
        : `Delete ${items.length} components`;

    const result = await recordDeleteItemsBatch({
      type: "delete-components-batch",
      description,
      collection: "components",
      items,
      refresh: builderData.refreshComponentsNow,
    });

    if (!options.silent && result.succeeded > 0 && result.failed === 0) {
      toast.success(
        result.succeeded === 1
          ? "Component deleted"
          : `${result.succeeded} components deleted`,
      );
    }

    return {
      succeeded: result.succeeded,
      failed: uniqueIds.length - result.succeeded,
      errors: [...errors, ...result.errors],
    };
  }

  function isLoadingComponent(): boolean {
    return isItemLoading.value === true;
  }

  return {
    loadComponentForEditing,
    createComponent,
    renameComponent,
    duplicateComponent,
    deleteComponent,
    deleteComponentsBatch,
    isLoadingComponent,
  };
}
