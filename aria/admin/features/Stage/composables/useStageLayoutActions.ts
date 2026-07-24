import type { Ref } from "vue";
import { z } from "zod";
import { toast } from "vue-sonner";
import { migratePageRootNodeSlots } from "../../../../lib/layouts/resolveNodeSlot";
import type { BuilderNode, LayoutDSL, PageDSL } from "../../../../lib/types/nodes";
import type { useHistory } from "../../History";
import {
  LayoutInspectorMetadataSchema,
  type LayoutInspectorMetadata,
} from "../../Core/types/layout";
import type { UseStageLoadingActionsReturn } from "./useStageLoadingActions";
import { useStageLayoutHistory } from "./useStageLayoutHistory";
import { useStudioCapabilities } from "@/composables/useStudioCapabilities";
import { LAYOUT_CHANGE_FORBIDDEN_MESSAGE } from "@/features/Studio/pages/utils/updatePageLayout";

const StageLayoutSlugSchema = z.string().trim();

export interface UseStageLayoutActionsDeps {
  currentPage: Ref<PageDSL | null>;
  currentLayout: Ref<LayoutDSL | null>;
  currentItemType: Ref<"page" | "layout" | "component">;
  pageBlocks: Ref<BuilderNode[]>;
  history: ReturnType<typeof useHistory>;
  handleLoadLayoutDataOnly: UseStageLoadingActionsReturn["handleLoadLayoutDataOnly"];
  handleSave: () => Promise<void>;
}

export interface UseStageLayoutActionsReturn {
  handleLayoutUpdate: (layoutSlug: string) => void;
  handleLayoutMetadataUpdate: (
    metadata: LayoutInspectorMetadata,
  ) => Promise<void>;
}

export function useStageLayoutActions(
  deps: UseStageLayoutActionsDeps,
): UseStageLayoutActionsReturn {
  const {
    currentPage,
    currentLayout,
    currentItemType,
    pageBlocks,
    history,
    handleLoadLayoutDataOnly,
    handleSave,
  } = deps;
  const { recordLayoutSelectionChange, recordLayoutMetadataUpdate } =
    useStageLayoutHistory(history);
  const { canEditPageStructure } = useStudioCapabilities();

  const loadLayoutDataOnly = async (slug: string): Promise<void> => {
    const parsedSlug = StageLayoutSlugSchema.safeParse(slug);
    if (!parsedSlug.success) {
      return;
    }

    const normalizedSlug = parsedSlug.data;
    if (!normalizedSlug) {
      return;
    }

    const layout = await handleLoadLayoutDataOnly(normalizedSlug);
    if (layout) {
      currentLayout.value = layout;
    }
  };

  const migratePageBlocksForCurrentLayout = (): void => {
    const layout = currentLayout.value;
    if (!layout?.slots?.length) {
      return;
    }

    const source =
      pageBlocks.value.length > 0
        ? pageBlocks.value
        : currentPage.value?.nodes;
    if (!source?.length) {
      return;
    }

    const migrated = migratePageRootNodeSlots(
      source,
      layout,
    ) as BuilderNode[];
    pageBlocks.value = migrated;
    if (currentPage.value) {
      currentPage.value.nodes = migrated;
    }
  };

  const applyLayoutSelection = async (layoutSlug?: string): Promise<void> => {
    if (currentPage.value) {
      currentPage.value.layout = layoutSlug;
    }

    if (layoutSlug) {
      await loadLayoutDataOnly(layoutSlug);
      migratePageBlocksForCurrentLayout();
    } else {
      currentLayout.value = null;
    }
  };

  const handleLayoutUpdate = (layoutSlug: string): void => {
    if (!currentPage.value) return;

    if (!canEditPageStructure.value) {
      toast.error(LAYOUT_CHANGE_FORBIDDEN_MESSAGE);
      return;
    }

    const parsedSlug = StageLayoutSlugSchema.safeParse(layoutSlug);
    if (!parsedSlug.success) {
      return;
    }

    const normalizedSlug = parsedSlug.data;
    const nextLayout = normalizedSlug || undefined;
    const previousLayout = currentPage.value.layout || undefined;

    void (async () => {
      const result = await recordLayoutSelectionChange({
        previousLayout,
        nextLayout,
        applyLayoutSelection,
      });

      if (!result.success) {
        return;
      }

      await handleSave();
    })();
  };

  const handleLayoutMetadataUpdate = async (
    metadata: LayoutInspectorMetadata,
  ): Promise<void> => {
    if (currentItemType.value !== "layout" || !currentLayout.value) return;

    const parsedMetadata = LayoutInspectorMetadataSchema.safeParse(metadata);
    if (!parsedMetadata.success) {
      return;
    }

    const nextMetadata = parsedMetadata.data;
    const oldMetadata = currentLayout.value.metadata;

    const result = await recordLayoutMetadataUpdate({
      previousMetadata: oldMetadata,
      nextMetadata,
      applyMetadata: async (value) => {
        if (currentLayout.value) {
          currentLayout.value.metadata = value;
        }
      },
    });

    if (!result.success) {
      return;
    }

    await handleSave();
  };

  return {
    handleLayoutUpdate,
    handleLayoutMetadataUpdate,
  };
}
