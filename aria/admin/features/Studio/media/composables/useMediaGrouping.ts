import { computed, type ComputedRef, type Ref } from "vue";
import { actions } from "astro:actions";
import { useHistory } from "@/features/History";
import { useCapabilities } from "@/composables/useCapabilities";
import { createStudioGroupingEngine } from "@/features/Studio/core/composables";
import {
  MediaGroupingResponseSchema,
  MediaGroupingStateSchema,
  type MediaGroup,
  type MediaGroupingState,
} from "@/lib/schemas/mediaGrouping";

export type { MediaGroup } from "@/lib/schemas/mediaGrouping";

export interface GroupableMediaAsset {
  id: string;
  name?: string;
}

async function loadGroupingState(): Promise<MediaGroupingState | null> {
  const { data, error } = await actions.settings.getMediaGrouping();

  if (error || !data) {
    return null;
  }

  const parsed = MediaGroupingResponseSchema.safeParse(data);
  if (!parsed.success) {
    return null;
  }

  return {
    groups: [...parsed.data.data.groups].sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    assignments: { ...parsed.data.data.assignments },
  };
}

const mediaGroupingEngine = createStudioGroupingEngine<
  MediaGroup,
  MediaGroupingState
>({
  stateSchema: MediaGroupingStateSchema,
  loadState: loadGroupingState,
  persistState: async (state) => {
    await actions.settings.updateMediaGrouping({
      mediaGrouping: state,
    });
  },
  fallbackState: () => ({
    groups: [],
    assignments: {},
  }),
  resetState: () => ({
    groups: [],
    assignments: {},
  }),
});

const customGroups = mediaGroupingEngine.groups;
const mediaGroupAssignments = mediaGroupingEngine.assignments;
const hasHydratedFromServer = mediaGroupingEngine.hasHydratedFromServer;

export async function ensureMediaGroupingHydrated(): Promise<void> {
  await mediaGroupingEngine.ensureHydrated();
}

export function resetMediaGroupingStateForTests(): void {
  mediaGroupingEngine.reset();
}

export interface UseMediaGroupingReturn {
  canReadGrouping: Ref<boolean>;
  canUpdateGrouping: Ref<boolean>;
  hasHydratedFromServer: Ref<boolean>;
  customGroups: Ref<MediaGroup[]>;
  mediaGroupAssignments: Ref<Record<string, string>>;
  getAssetGroupId: (assetId: string) => string | null;
  getGroupMemberCount: (
    groupId: string,
    items: readonly GroupableMediaAsset[],
  ) => number;
  createCustomGroup: (name: string) => Promise<string | null>;
  renameCustomGroup: (groupId: string, name: string) => Promise<void>;
  deleteCustomGroup: (groupId: string) => Promise<void>;
  moveAssetToGroup: (assetId: string, groupId?: string) => Promise<void>;
  moveAssetsToGroup: (
    assetIds: readonly string[],
    groupId?: string,
  ) => Promise<number>;
}

export function useMediaGrouping(
  items: ComputedRef<readonly GroupableMediaAsset[]>,
): UseMediaGroupingReturn {
  const { execute } = useHistory();
  const { canOperation } = useCapabilities();

  const canReadGrouping = computed(() =>
    canOperation("settings.getMediaGrouping"),
  );
  const canUpdateGrouping = computed(() =>
    canOperation("settings.updateMediaGrouping"),
  );

  void ensureMediaGroupingHydrated();

  function getAssetGroupId(assetId: string): string | null {
    return mediaGroupingEngine.getAssignedGroupId(assetId);
  }

  function getGroupMemberCount(
    groupId: string,
    sourceItems: readonly GroupableMediaAsset[],
  ): number {
    return sourceItems.filter(
      (item) => mediaGroupAssignments.value[item.id] === groupId,
    ).length;
  }

  mediaGroupingEngine.watchPersistence(canUpdateGrouping);

  async function createCustomGroup(name: string): Promise<string | null> {
    return mediaGroupingEngine.createCustomGroup({
      name,
      canUpdateGrouping,
      execute,
      type: "create-media-group",
      describe: (groupName) => `Create media folder "${groupName}"`,
    });
  }

  async function renameCustomGroup(
    groupId: string,
    name: string,
  ): Promise<void> {
    await mediaGroupingEngine.renameCustomGroup({
      groupId,
      name,
      canUpdateGrouping,
      execute,
      type: "rename-media-group",
      describe: (previousName, nextName) =>
        `Rename media folder "${previousName}" to "${nextName}"`,
    });
  }

  async function deleteCustomGroup(groupId: string): Promise<void> {
    await mediaGroupingEngine.deleteCustomGroup({
      groupId,
      canUpdateGrouping,
      execute,
      type: "delete-media-group",
      describe: (groupName) => `Delete media folder "${groupName}"`,
    });
  }

  async function moveAssetsToGroup(
    assetIds: readonly string[],
    groupId?: string,
  ): Promise<number> {
    return mediaGroupingEngine.moveItemsToGroup({
      itemIds: assetIds,
      groupId,
      canUpdateGrouping,
      execute,
      type: "move-media-group",
      allItemsLabel: "All Media",
      describe: (idsToMove, targetGroupLabel) =>
        idsToMove.length === 1
          ? `Move media "${
              items.value.find((item) => item.id === idsToMove[0])?.name ||
              idsToMove[0]
            }" to "${targetGroupLabel}"`
          : `Move ${idsToMove.length} media assets to "${targetGroupLabel}"`,
    });
  }

  async function moveAssetToGroup(
    assetId: string,
    groupId?: string,
  ): Promise<void> {
    await moveAssetsToGroup([assetId], groupId);
  }

  return {
    canReadGrouping,
    canUpdateGrouping,
    hasHydratedFromServer,
    customGroups,
    mediaGroupAssignments,
    getAssetGroupId,
    getGroupMemberCount,
    createCustomGroup,
    renameCustomGroup,
    deleteCustomGroup,
    moveAssetToGroup,
    moveAssetsToGroup,
  };
}
