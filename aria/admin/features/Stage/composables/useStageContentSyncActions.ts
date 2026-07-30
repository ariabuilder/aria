import type { Ref } from "vue";
import { z } from "zod";
import type {
  BuilderNode,
  ComponentDSL,
  PageDSL,
} from "../../../../lib/types/nodes";
import {
  BuilderNodeSchema,
  ComponentDSLSchema,
  PageDSLSchema,
} from "../../../../lib/schemas/nodes";
import { log } from "@/lib/utils/logger";

const StageBlocksSchema = z.array(BuilderNodeSchema);

export interface UseStageContentSyncActionsDeps {
  currentPage: Ref<PageDSL | null>;
  currentComponent: Ref<ComponentDSL | null>;
  lastSavedSnapshot: Ref<string>;
  hasUnsavedChanges: Ref<boolean>;
  pageBlocks: Ref<BuilderNode[]>;
  createSnapshot: (blocks: BuilderNode[]) => string;
}

export interface UseStageContentSyncActionsReturn {
  handleSidebarComponentSaved: (component: ComponentDSL) => void;
  handleSidebarPageSaved: (page: PageDSL) => void;
  handleActiveBlocksUpdate: (blocks: BuilderNode[]) => void;
}

export function useStageContentSyncActions(
  deps: UseStageContentSyncActionsDeps,
): UseStageContentSyncActionsReturn {
  const {
    currentPage,
    currentComponent,
    lastSavedSnapshot,
    hasUnsavedChanges,
    pageBlocks,
    createSnapshot,
  } = deps;

  const handleSidebarComponentSaved = (component: ComponentDSL): void => {
    const parsedComponent = ComponentDSLSchema.safeParse(component);
    if (!parsedComponent.success) {
      log(
        "warn",
        "[useStageContentSyncActions] Ignoring invalid component save payload",
        {
          issues: parsedComponent.error.issues,
        },
      );
      return;
    }

    currentComponent.value = parsedComponent.data;
    lastSavedSnapshot.value = createSnapshot(pageBlocks.value);
    hasUnsavedChanges.value = false;
  };

  const handleSidebarPageSaved = (page: PageDSL): void => {
    const parsedPage = PageDSLSchema.safeParse(page);
    if (!parsedPage.success) {
      log(
        "warn",
        "[useStageContentSyncActions] Ignoring invalid page save payload",
        {
          issues: parsedPage.error.issues,
        },
      );
      return;
    }

    currentPage.value = parsedPage.data;
    hasUnsavedChanges.value = true;
  };

  const handleActiveBlocksUpdate = (blocks: BuilderNode[]): void => {
    const parsedBlocks = StageBlocksSchema.safeParse(blocks);
    if (!parsedBlocks.success) {
      log(
        "warn",
        "[useStageContentSyncActions] Ignoring invalid active blocks payload",
        {
          issues: parsedBlocks.error.issues,
        },
      );
      return;
    }

    pageBlocks.value = parsedBlocks.data;
    if (currentPage.value) {
      currentPage.value.nodes = parsedBlocks.data;
    }
  };

  return {
    handleSidebarComponentSaved,
    handleSidebarPageSaved,
    handleActiveBlocksUpdate,
  };
}
