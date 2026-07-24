<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { FlexRender } from "@tanstack/vue-table";
import { toast } from "vue-sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import PageHeader from "@/features/Studio/core/components/PageHeader.vue";
import FilterIconMenu from "@/features/Studio/core/components/FilterIconMenu.vue";
import HeaderActionTooltip from "@/features/Studio/core/components/HeaderActionTooltip.vue";
import StudioTableHeader from "@/features/Studio/core/components/StudioTableHeader.vue";
import StudioTableColGroup from "@/features/Studio/core/components/StudioTableColGroup.vue";
import { toStudioTableHeaderTable } from "@/features/Studio/core/lib/studioTableHeader";
import { useStudioCapabilities } from "@/composables/useStudioCapabilities";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";
import type { MediaAsset, MediaAssetType } from "../types/media";
import { MediaAssetSchema } from "../composables/mediaActionResults";
import {
  MediaUploadError,
  uploadMediaFile,
  useMediaAssets,
  useMediaGrouping,
  useMediaPickerState,
  useMediaTable,
} from "../composables";
import {
  assetMatchesMediaTypeFilter,
  findUploadedAssetInList,
  getUploadAcceptForMediaType,
} from "../utils/mediaPickerUtils";
import type { MediaTypeFilter } from "../utils/mediaPickerUtils";
import {
  getAssetIcon,
  getThumbnailUrl,
  handleThumbnailError,
  isFontAsset,
} from "../utils";

interface Props {
  open: boolean;
  title?: string;
  description?: string;
  mediaType?: MediaAssetType;
  mediaTypes?: readonly MediaAssetType[];
}

const props = withDefaults(defineProps<Props>(), {
  mediaType: undefined,
  mediaTypes: undefined,
});
const { t } = useStudioI18n();
const dialogTitle = computed(() => props.title ?? t("media.picker.title"));
const dialogDescription = computed(
  () => props.description ?? t("media.picker.description"),
);

const emit = defineEmits<{
  "update:open": [value: boolean];
  select: [asset: MediaAsset];
}>();

const titleId = "media-picker-dialog-title";
const descriptionId = "media-picker-dialog-description";

const {
  assets,
  isLoading,
  loadAssets: loadSharedAssets,
} = useMediaAssets();
const isUploading = ref(false);

const { canUploadMedia, getForbiddenMessage } = useStudioCapabilities();

const mediaAssets = computed(() => assets.value);
const grouping = useMediaGrouping(mediaAssets);
const activeFolderFilter = ref("all");
const activeGroupId = computed(() =>
  activeFolderFilter.value.startsWith("group:")
    ? activeFolderFilter.value.slice("group:".length)
    : null,
);
const mediaTypeFilter = computed<MediaTypeFilter>(() =>
  props.mediaTypes && props.mediaTypes.length > 0
    ? props.mediaTypes
    : props.mediaType,
);

const pickableAssets = computed(() =>
  assets.value.filter((asset) =>
    assetMatchesMediaTypeFilter(asset, mediaTypeFilter.value),
  ),
);

const folderFilters = computed(() => [
  {
    key: "all",
    label: t("media.all"),
    count: pickableAssets.value.length,
  },
]);

const folderFilterSections = computed(() => {
  if (grouping.customGroups.value.length === 0) {
    return [];
  }

  return [
    {
      label: t("media.folders"),
      options: grouping.customGroups.value.map((group) => ({
        key: `group:${group.id}`,
        label: group.name,
        count: pickableAssets.value.filter(
          (asset) => grouping.mediaGroupAssignments.value[asset.id] === group.id,
        ).length,
      })),
    },
  ];
});

const activeFolderFilterLabel = computed(() => {
  if (!activeGroupId.value) {
    return t("media.all");
  }

  return (
    grouping.customGroups.value.find((group) => group.id === activeGroupId.value)
      ?.name ?? t("media.folder")
  );
});

const showFolderFilter = computed(() => grouping.canReadGrouping.value);

const {
  searchQuery,
  viewMode,
  filteredAssets,
  toggleViewMode,
  reset,
} = useMediaPickerState({
  assets,
  mediaType: mediaTypeFilter,
  activeGroupId,
  assignments: grouping.mediaGroupAssignments,
});

const { table } = useMediaTable({
  mode: "picker",
  data: filteredAssets,
});

const loadPickerAssets = async (options: { force?: boolean } = {}): Promise<void> => {
  await loadSharedAssets({
    force: options.force,
  });
};

const handleSelect = (asset: MediaAsset): void => {
  const parsed = MediaAssetSchema.safeParse(asset);
  if (!parsed.success) {
    toast.error(t("media.invalidAsset"));
    return;
  }

  emit("select", parsed.data);
  emit("update:open", false);
};

const handleUpload = async (): Promise<void> => {
  if (!canUploadMedia.value) {
    toast.error(getForbiddenMessage("media.upload"));
    return;
  }

  const input = document.createElement("input");
  input.type = "file";
  input.multiple = false;
  input.accept = getUploadAcceptForMediaType(mediaTypeFilter.value);

  input.onchange = async (event) => {
    const files = (event.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;

    isUploading.value = true;
    try {
      const uploadResult = await uploadMediaFile({
        file: files[0],
        source: "MediaPickerDialog.handleUpload",
      });

      if (!uploadResult) {
        toast.error(t("media.uploadFailed"));
        return;
      }

      await loadPickerAssets({ force: true });

      const uploadedAsset = findUploadedAssetInList(assets.value, uploadResult);
      if (
        uploadedAsset &&
        assetMatchesMediaTypeFilter(uploadedAsset, mediaTypeFilter.value)
      ) {
        handleSelect(uploadedAsset);
        return;
      }

      toast.success(t("media.uploadComplete"));
    } catch (error) {
      toast.error(
        error instanceof MediaUploadError ? error.message : t("media.uploadFailed"),
      );
    } finally {
      isUploading.value = false;
    }
  };

  input.click();
};

const handleRowKeydown = (event: KeyboardEvent, asset: MediaAsset): void => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    handleSelect(asset);
  }
};

const resetPickerState = (): void => {
  reset();
  activeFolderFilter.value = "all";
};

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      resetPickerState();
      return;
    }

    resetPickerState();
    await loadPickerAssets({ force: true });
  },
);

watch(
  () => [activeGroupId.value, grouping.customGroups.value] as const,
  ([groupId, groups]) => {
    if (!groupId) {
      return;
    }

    if (!groups.some((group) => group.id === groupId)) {
      activeFolderFilter.value = "all";
    }
  },
);
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent
      :aria-labelledby="titleId"
      :aria-describedby="descriptionId"
      class="max-w-4xl! w-[80dvw]! h-[80dvh]! p-0 gap-0 overflow-hidden"
    >
      <DialogDescription :id="descriptionId" class="sr-only">
        {{ dialogDescription }}
      </DialogDescription>
      <div class="flex h-full min-h-0 w-full flex-col">
        <PageHeader
          :title="dialogTitle"
          :description="dialogDescription"
          :search-query="searchQuery"
          hide-create
          merge-actions
          reserve-close-space
          search-tooltip-side="top"
          :tooltip-portalled="false"
          @update:search-query="searchQuery = $event"
          class=""
        >
          <template #title>
            <DialogTitle
              :id="titleId"
              class="truncate text-3xl leading-0 font-medium font-serif tracking-tight"
            >
              {{ dialogTitle }}
            </DialogTitle>
          </template>

          <template #toolbar>
            <FilterIconMenu
              v-if="showFolderFilter"
              v-model="activeFolderFilter"
              :filters="folderFilters"
              :sections="folderFilterSections"
              :active-label="activeFolderFilterLabel"
            />
            <HeaderActionTooltip
              side="top"
              :portalled="false"
              :label="viewMode === 'grid' ? t('media.listView') : t('media.gridView')"
            >
              <Button
                variant="headerAction"
                size="icon-header"
                @click="toggleViewMode"
              >
                <span
                  v-if="viewMode === 'grid'"
                  :class="[studioIcons.list, 'size-3.5 shrink-0']"
                />
                <span v-else :class="[studioIcons.grid, 'size-3.5 shrink-0']" />
              </Button>
            </HeaderActionTooltip>
            <Button
              v-if="canUploadMedia"
              variant="secondary"
              size="sm"
              class="ml-2 h-8 shrink-0 text-sm"
              :disabled="isUploading || isLoading"
              @click="handleUpload"
            >
              <span :class="[studioIcons.upload, 'size-3.5 shrink-0']" />
              {{ isUploading ? t("media.uploading") : t("media.upload") }}
            </Button>
          </template>
        </PageHeader>

        <div
          class="min-h-0 flex-1 overflow-y-auto overscroll-y-none bg-background/30"
        >
          <div v-if="isLoading" class="flex items-center justify-center py-16">
            <span
              :class="[
                studioIcons.refreshLine,
                'size-6 shrink-0 text-muted-foreground animate-spin',
              ]"
            />
          </div>

          <div
            v-else-if="filteredAssets.length === 0"
            class="flex flex-col items-center justify-center py-16"
          >
            <span
              :class="[studioIcons.media, 'size-8 shrink-0 text-muted-foreground mb-2']"
            />
            <p class="text-sm text-muted-foreground mb-3">
              {{
                searchQuery.trim()
                  ? t("media.noMatching")
                  : t("media.noMedia")
              }}
            </p>
            <Button
              v-if="canUploadMedia && !searchQuery.trim()"
              variant="ghost"
              size="sm"
              class="gap-1.5 text-xs"
              :disabled="isUploading"
              @click="handleUpload"
            >
              <span :class="[studioIcons.upload, 'size-3.5 shrink-0']" />
              {{ t("media.uploadFiles") }}
            </Button>
          </div>

          <div
            v-else-if="viewMode === 'grid'"
            class="grid grid-cols-2 gap-3 p-5 md:grid-cols-3 lg:grid-cols-4"
          >
            <button
              v-for="asset in filteredAssets"
              :key="asset.id"
              type="button"
              class="overflow-hidden rounded-md border border-border text-left hover:border-primary/70 hover:brightness-110 hover:border-dashed hover:shadow-xs transition-all duration-100"
              @click="handleSelect(asset)"
            >
              <div
                class="flex h-28 items-center justify-center overflow-hidden bg-input"
              >
                <img
                  v-if="asset.type === 'image' || asset.type === 'icon'"
                  :src="getThumbnailUrl(asset)"
                  :alt="asset.name"
                  class="h-full w-full"
                  :class="
                    asset.type === 'icon'
                      ? 'object-contain p-3'
                      : 'object-cover'
                  "
                  @error="(event) => handleThumbnailError(event, asset)"
                />
                <span
                  v-else-if="isFontAsset(asset)"
                  :class="[
                    getAssetIcon(asset.type),
                    'size-6 shrink-0 text-muted-foreground',
                  ]"
                />
                <div
                  v-else
                  class="px-2 text-center text-xs text-muted-foreground"
                >
                  {{ asset.type.toUpperCase() }}
                </div>
              </div>
            </button>
          </div>

          <div v-else class="min-w-0">
            <StudioTableHeader :table="toStudioTableHeaderTable(table)" />
            <Table class="w-full border-collapse table-fixed bg-background">
              <StudioTableColGroup :table="toStudioTableHeaderTable(table)" />
              <TableBody>
                <TableRow
                  v-for="row in table.getRowModel().rows"
                  :key="row.id"
                  tabindex="0"
                  class="group cursor-pointer transition-all duration-50 hover:bg-muted/30 hover:[box-shadow:inset_2px_0_0_0_var(--primary),inset_-2px_0_0_0_var(--primary)]"
                  @click="handleSelect(row.original)"
                  @keydown="handleRowKeydown($event, row.original)"
                >
                  <TableCell
                    v-for="cell in row.getVisibleCells()"
                    :key="cell.id"
                    :style="{ width: `${cell.column.getSize()}px` }"
                    class="border-b border-dashed border-border px-3 py-2 text-xs"
                  >
                    <FlexRender
                      :render="cell.column.columnDef.cell"
                      :props="cell.getContext()"
                    />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>

        <div
          class="flex shrink-0 items-center border-t border-border border-dashed px-7 py-3 text-2xs text-muted-foreground/80"
        >
          {{ filteredAssets.length }} asset{{
            filteredAssets.length === 1 ? "" : "s"
          }}
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
