import { computed, ref } from "vue";
import { actions } from "astro:actions";

import { useBuilderData } from "@/composables/useBuilderData";
import { log } from "@/lib/utils/logger";
import {
  ComponentDSLSchema,
  LayoutDSLSchema,
  PageDSLSchema,
} from "../../../../lib/schemas/nodes";
import type {
  ComponentDSL,
  LayoutDSL,
  PageDSL,
} from "../../../../lib/types/nodes";
import { getBreakpointIconClass } from "@/composables/breakpointIcons";
import { useCanonicalBreakpoints } from "@/composables/useCanonicalBreakpoints";
import { useResponsiveTarget } from "@/composables/useResponsiveTarget";
import { useClassEditor } from "../../Inspector/composables/useClassEditor";
import { useClassCssEditor } from "./useClassCssEditor";
import {
  buildClassManagerUsageIndex,
  type ClassManagerCollection,
  type ClassManagerScannableItem,
  type ClassManagerUsageLocation,
  type ClassManagerUsageIndex,
} from "../lib/classManagerInventory";
import { buildClassManagerRows } from "../lib/classManagerTable";

type ActionTransportResult = {
  data?: unknown;
  error?: { message?: string } | null;
};

const GetItemSchemaMap = {
  pages: PageDSLSchema,
  layouts: LayoutDSLSchema,
  components: ComponentDSLSchema,
} as const;

type GetItemDataMap = {
  pages: PageDSL;
  layouts: LayoutDSL;
  components: ComponentDSL;
};

async function loadScannableDsl<TCollection extends ClassManagerCollection>(
  collection: TCollection,
  slug: string,
  context: Record<string, unknown>,
): Promise<GetItemDataMap[TCollection] | null> {
  const result = (await actions.getItem({
    collection,
    slug,
  })) as ActionTransportResult;

  if (result.error || !result.data) {
    return null;
  }

  const parsed = GetItemSchemaMap[collection].safeParse(result.data);
  if (!parsed.success) {
    log("warn", "[ClassManager] Invalid getItem payload while scanning usage", {
      collection,
      slug,
      issues: parsed.error.issues,
      ...context,
    });
    return null;
  }

  return parsed.data as GetItemDataMap[TCollection];
}

export function useClassManagerInventory() {
  const builderData = useBuilderData();
  const classEditor = useClassEditor();
  const { saveClassVariantCss, error: cssEditorError } = useClassCssEditor();
  const { activeViewports } = useCanonicalBreakpoints({ autoLoad: true });
  const { targetBreakpoint, setTargetBreakpoint } = useResponsiveTarget();

  const isInventoryLoading = ref(false);
  const inventoryError = ref<string | null>(null);
  const usageIndex = ref<ClassManagerUsageIndex>({});

  const rows = computed(() =>
    buildClassManagerRows(classEditor.customClasses.value, usageIndex.value),
  );

  async function loadInventory(force = false): Promise<void> {
    if (isInventoryLoading.value && !force) {
      return;
    }

    isInventoryLoading.value = true;
    inventoryError.value = null;

    try {
      await Promise.all([
        builderData.fetchBuilderData({ silent: true, force }),
        classEditor.loadClasses(),
      ]);

      const pageItems = await Promise.all(
        builderData.pages.value.map(async (page) => {
          const slug = page.slug || page.id;
          const pageData = await loadScannableDsl("pages", slug, {
            source: "useClassManagerInventory.loadInventory.pages",
            pageId: page.id,
          });

          if (!pageData) {
            return null;
          }

          const item: ClassManagerScannableItem = {
            collection: "pages",
            id: page.id,
            label: page.title || pageData.title || page.id,
            path: `/${slug}`,
            nodes: pageData.nodes,
          };

          return item;
        }),
      );

      const layoutItems = await Promise.all(
        builderData.layouts.value.map(async (layout) => {
          const layoutData = await loadScannableDsl("layouts", layout.id, {
            source: "useClassManagerInventory.loadInventory.layouts",
            layoutId: layout.id,
          });

          if (!layoutData) {
            return null;
          }

          const item: ClassManagerScannableItem = {
            collection: "layouts",
            id: layout.id,
            label: layout.name || layoutData.name || layout.id,
            path: layout.id,
            nodes: layoutData.nodes,
          };

          return item;
        }),
      );

      const componentItems = await Promise.all(
        builderData.components.value.map(async (component) => {
          const componentData = await loadScannableDsl(
            "components",
            component.id,
            {
              source: "useClassManagerInventory.loadInventory.components",
              componentId: component.id,
            },
          );

          if (!componentData) {
            return null;
          }

          const item: ClassManagerScannableItem = {
            collection: "components",
            id: component.id,
            label: component.name || componentData.name || component.id,
            path: component.id,
            nodes: componentData.nodes,
          };

          return item;
        }),
      );

      const allItems = [...pageItems, ...layoutItems, ...componentItems].filter(
        (item): item is ClassManagerScannableItem => item !== null,
      );

      usageIndex.value = buildClassManagerUsageIndex(allItems);
    } catch (error) {
      inventoryError.value =
        error instanceof Error
          ? error.message
          : "Failed to load class inventory";

      log("error", "[ClassManager] Failed to load inventory", {
        error: inventoryError.value,
      });
    } finally {
      isInventoryLoading.value = false;
    }
  }

  async function refreshInventory(): Promise<void> {
    await loadInventory(true);
  }

  async function createClass(
    name: string,
    description?: string,
  ): Promise<boolean> {
    return classEditor.createClass(name, description);
  }

  async function renameClass(
    previousName: string,
    nextName: string,
  ): Promise<boolean> {
    const success = await classEditor.renameClass(previousName, nextName);

    if (success) {
      await refreshInventory();
    }

    return success;
  }

  async function duplicateClass(
    sourceName: string,
    nextName: string,
  ): Promise<boolean> {
    return classEditor.duplicateClass(sourceName, nextName);
  }

  const availableBreakpoints = computed(() =>
    activeViewports.value
      .filter((bp) => bp.enabled || bp.id === "base")
      .map((bp) => ({
        id: bp.id,
        label: bp.label,
        icon: getBreakpointIconClass({
          id: bp.id,
          icon: bp.icon,
          width: bp.width,
        }),
      })),
  );

  async function updateClassCss(
    className: string,
    cssText: string,
    breakpoint?: string,
  ): Promise<boolean> {
    inventoryError.value = null;

    const classDefinition = classEditor.customClasses.value[className];
    if (!classDefinition) {
      inventoryError.value = `Class ${className} no longer exists`;
      return false;
    }

    const targetBp = breakpoint ?? classEditor.currentBreakpoint.value;
    const previousTarget = targetBreakpoint.value;

    if (breakpoint && breakpoint !== previousTarget) {
      setTargetBreakpoint(breakpoint);
    }

    try {
      const success = await saveClassVariantCss({
        className,
        cssText,
        breakpoint: targetBp,
        pseudoState: "default",
        preserveActiveClass: false,
      });

      if (!success) {
        inventoryError.value = cssEditorError.value ?? "Failed to update CSS";
        return false;
      }

      await refreshInventory();
      return true;
    } catch (updateError) {
      inventoryError.value =
        updateError instanceof Error
          ? updateError.message
          : "Failed to update CSS";
      return false;
    } finally {
      if (breakpoint && breakpoint !== previousTarget) {
        setTargetBreakpoint(previousTarget);
      }
    }
  }

  async function deleteClass(name: string): Promise<boolean> {
    const success = await classEditor.deleteClass(name);

    if (success) {
      await refreshInventory();
    }

    return success;
  }

  async function deleteClasses(names: string[]): Promise<{
    succeeded: number;
    failed: number;
  }> {
    const success = await classEditor.deleteClasses(names);

    if (success) {
      await refreshInventory();
    }

    return {
      succeeded: success ? names.length : 0,
      failed: success ? 0 : names.length,
    };
  }

  async function removeOrphanedClassReferences(
    className: string,
    locations: readonly ClassManagerUsageLocation[],
  ): Promise<boolean> {
    inventoryError.value = null;

    const uniqueLocations = Array.from(
      new Map(
        locations.map((location) => [
          `${location.collection}:${location.itemId}:${location.nodeId}`,
          location,
        ]),
      ).values(),
    );

    try {
      for (const location of uniqueLocations) {
        const result = (await actions.nodes.removeCustomClass({
          collection: location.collection,
          id: location.itemId,
          nodeId: location.nodeId,
          className,
        })) as ActionTransportResult;

        if (result.error) {
          inventoryError.value =
            result.error.message ??
            `Failed to remove ${className} from ${location.itemLabel}`;
          return false;
        }
      }

      await refreshInventory();
      return true;
    } catch (error) {
      inventoryError.value =
        error instanceof Error
          ? error.message
          : `Failed to remove orphaned references for ${className}`;
      return false;
    }
  }

  async function removeOrphanedClassReferencesBatch(
    groups: Array<{
      className: string;
      locations: readonly ClassManagerUsageLocation[];
    }>,
  ): Promise<{ succeeded: string[]; failed: string[] }> {
    inventoryError.value = null;

    const succeeded: string[] = [];
    const failed: string[] = [];

    // Deduplicate across all groups — each location targets a different document
    // so they can run concurrently
    const allTasks: Array<() => Promise<{ className: string; ok: boolean }>> =
      [];

    for (const group of groups) {
      const uniqueLocations = Array.from(
        new Map(
          group.locations.map((location) => [
            `${location.collection}:${location.itemId}:${location.nodeId}`,
            location,
          ]),
        ).values(),
      );

      for (const location of uniqueLocations) {
        allTasks.push(async () => {
          const result = (await actions.nodes.removeCustomClass({
            collection: location.collection,
            id: location.itemId,
            nodeId: location.nodeId,
            className: group.className,
          })) as ActionTransportResult;

          return {
            className: group.className,
            ok: !result.error,
          };
        });
      }
    }

    const results = await Promise.allSettled(allTasks.map((task) => task()));

    // Track per-class: count of total locations and failures
    const classResults = new Map<string, { total: number; failures: number }>();

    for (const result of results) {
      const className =
        result.status === "fulfilled" ? result.value.className : "unknown";
      const ok = result.status === "fulfilled" && result.value.ok;

      const entry = classResults.get(className) ?? { total: 0, failures: 0 };
      entry.total++;
      if (!ok) {
        entry.failures++;
      }
      classResults.set(className, entry);
    }

    for (const [className, { total: _total, failures }] of classResults) {
      if (failures === 0) {
        succeeded.push(className);
      } else {
        failed.push(className);
      }
    }

    await refreshInventory();

    return { succeeded, failed };
  }

  return {
    rows,
    usageIndex,
    builderData,
    inventoryError,
    isInventoryLoading,
    isClassEditorLoading: classEditor.isLoading,
    currentBreakpoint: classEditor.currentBreakpoint,
    availableBreakpoints,
    loadInventory,
    refreshInventory,
    createClass,
    renameClass,
    duplicateClass,
    deleteClass,
    deleteClasses,
    removeOrphanedClassReferences,
    removeOrphanedClassReferencesBatch,
    updateClassCss,
  };
}
