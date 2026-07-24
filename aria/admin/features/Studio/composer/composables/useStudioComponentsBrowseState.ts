import { computed, ref, type WritableComputedRef } from "vue";
import { z } from "zod";

const StudioComponentsBrowseViewSchema = z.enum([
  "home",
  "category",
  "component",
]);

const StudioComponentsBrowseSortSchema = z.enum([
  "recent",
  "alphabetical",
  "most-used",
]);

const StudioComponentsBrowseDensitySchema = z.enum([
  "comfortable",
  "compact",
]);

const StudioComponentsCategoryKeySchema = z.string().trim().min(1).nullable();
const StudioComponentsSelectedIdSchema = z.string().trim().min(1).nullable();

export type StudioComponentsBrowseView = z.infer<
  typeof StudioComponentsBrowseViewSchema
>;
export type StudioComponentsBrowseSort = z.infer<
  typeof StudioComponentsBrowseSortSchema
>;
export type StudioComponentsBrowseDensity = z.infer<
  typeof StudioComponentsBrowseDensitySchema
>;

export interface UseStudioComponentsBrowseStateReturn {
  activeView: WritableComputedRef<StudioComponentsBrowseView>;
  selectedCategoryKey: WritableComputedRef<string | null>;
  selectedComponentId: WritableComputedRef<string | null>;
  sortMode: WritableComputedRef<StudioComponentsBrowseSort>;
  density: WritableComputedRef<StudioComponentsBrowseDensity>;
  showCreateGroupDialog: WritableComputedRef<boolean>;
  enterHome: () => void;
  enterCategory: (categoryKey: string) => void;
  enterComponent: (componentId: string) => void;
  closeComponent: () => void;
  openCreateGroupDialog: () => void;
  closeCreateGroupDialog: () => void;
}

const activeViewState = ref<StudioComponentsBrowseView>("home");
const selectedCategoryKeyState = ref<string | null>(null);
const selectedComponentIdState = ref<string | null>(null);
const sortModeState = ref<StudioComponentsBrowseSort>("recent");
const densityState = ref<StudioComponentsBrowseDensity>("comfortable");
const showCreateGroupDialogState = ref(false);

export function useStudioComponentsBrowseState(): UseStudioComponentsBrowseStateReturn {
  const activeView = computed({
    get: () => activeViewState.value,
    set: (value: StudioComponentsBrowseView) => {
      activeViewState.value = StudioComponentsBrowseViewSchema.parse(value);
    },
  });

  const selectedCategoryKey = computed({
    get: () => selectedCategoryKeyState.value,
    set: (value: string | null) => {
      selectedCategoryKeyState.value = StudioComponentsCategoryKeySchema.parse(
        value,
      );
    },
  });

  const selectedComponentId = computed({
    get: () => selectedComponentIdState.value,
    set: (value: string | null) => {
      selectedComponentIdState.value =
        StudioComponentsSelectedIdSchema.parse(value);
    },
  });

  const sortMode = computed({
    get: () => sortModeState.value,
    set: (value: StudioComponentsBrowseSort) => {
      sortModeState.value = StudioComponentsBrowseSortSchema.parse(value);
    },
  });

  const density = computed({
    get: () => densityState.value,
    set: (value: StudioComponentsBrowseDensity) => {
      densityState.value = StudioComponentsBrowseDensitySchema.parse(value);
    },
  });

  const showCreateGroupDialog = computed({
    get: () => showCreateGroupDialogState.value,
    set: (value: boolean) => {
      showCreateGroupDialogState.value = z.boolean().parse(value);
    },
  });

  const enterHome = (): void => {
    activeView.value = "home";
    selectedCategoryKey.value = null;
    selectedComponentId.value = null;
  };

  const enterCategory = (categoryKey: string): void => {
    selectedCategoryKey.value = z.string().trim().min(1).parse(categoryKey);
    selectedComponentId.value = null;
    activeView.value = "category";
  };

  const enterComponent = (componentId: string): void => {
    selectedComponentId.value = z.string().trim().min(1).parse(componentId);
    activeView.value = "component";
  };

  const closeComponent = (): void => {
    selectedComponentId.value = null;
    activeView.value = selectedCategoryKey.value ? "category" : "home";
  };

  const openCreateGroupDialog = (): void => {
    showCreateGroupDialog.value = true;
  };

  const closeCreateGroupDialog = (): void => {
    showCreateGroupDialog.value = false;
  };

  return {
    activeView,
    selectedCategoryKey,
    selectedComponentId,
    sortMode,
    density,
    showCreateGroupDialog,
    enterHome,
    enterCategory,
    enterComponent,
    closeComponent,
    openCreateGroupDialog,
    closeCreateGroupDialog,
  };
}
