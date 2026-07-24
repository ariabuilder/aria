<script setup lang="ts">
import { computed, ref } from "vue";
import { Button } from "@/components/ui/button";
import MediaContextMenuContent from "./MediaContextMenuContent.vue";
import {
  ContextMenu,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import FontAssetPreview from "./FontAssetPreview.vue";
import {
  getAssetIcon,
  getThumbnailUrl,
  handleThumbnailError,
  isFontAsset,
} from "../utils";
import {
  isRemoteImagePreviewUrl,
  isRemoteVideoPreviewUrl,
} from "../../../../../lib/media/utils/mediaType";
import type { MediaGroup } from "@/lib/schemas/mediaGrouping";
import type { MediaAsset } from "../types";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";

interface Props {
  asset: MediaAsset;
  index?: number;
  shouldAnimate?: boolean;
  canDelete?: boolean;
  readOnly?: boolean;
  sourceBadge?: string | null;
  canUpdateGrouping?: boolean;
  customGroups?: readonly MediaGroup[];
  currentGroupId?: string | null;
  draggable?: boolean;
  primaryAction?: "preview" | "open";
}

const props = withDefaults(defineProps<Props>(), {
  index: 0,
  shouldAnimate: true,
  canDelete: true,
  readOnly: false,
  sourceBadge: null,
  canUpdateGrouping: false,
  customGroups: () => [],
  currentGroupId: null,
  draggable: false,
  primaryAction: "preview",
});
const { t } = useStudioI18n();

const emit = defineEmits<{
  open: [asset: MediaAsset];
  preview: [asset: MediaAsset];
  copyUrl: [asset: MediaAsset];
  rename: [asset: MediaAsset];
  duplicate: [asset: MediaAsset];
  delete: [asset: MediaAsset];
  moveToGroup: [groupId?: string];
  dragStart: [event: DragEvent];
  dragEnd: [];
}>();

const isFont = computed(() => isFontAsset(props.asset));

const previewSource = computed(
  () => props.asset.deliveryUrl || props.asset.url || "",
);

const showsImagePreview = computed(() => {
  if (props.asset.type === "image" || props.asset.type === "icon") {
    return true;
  }

  return isRemoteImagePreviewUrl(previewSource.value);
});

const showsVideoPreview = computed(
  () =>
    props.asset.type === "video" ||
    isRemoteVideoPreviewUrl(previewSource.value),
);

const loadedPreviewDimensions = ref<{ width: number; height: number } | null>(
  null,
);

const previewFrameStyle = computed<Record<string, string>>(() => ({
  aspectRatio: resolvePreviewAspectRatio(
    props.asset,
    isFont.value,
    loadedPreviewDimensions.value,
  ),
}));

const previewImageClass = computed(() => {
  return props.asset.type === "icon"
    ? "h-full w-full object-contain p-8"
    : "h-full w-full object-cover";
});

const entranceStyle = computed<Record<string, string> | undefined>(() => {
  if (!props.shouldAnimate) {
    return undefined;
  }

  return {
    "animation-delay": `${Math.min(props.index, 12) * 40}ms`,
  };
});

function resolvePreviewAspectRatio(
  asset: MediaAsset,
  fontAsset: boolean,
  loadedDimensions?: { width: number; height: number } | null,
): string {
  if (fontAsset) {
    return "5 / 4";
  }

  const measuredWidth = loadedDimensions?.width ?? 0;
  const measuredHeight = loadedDimensions?.height ?? 0;

  if (measuredWidth > 0 && measuredHeight > 0) {
    return `${measuredWidth} / ${measuredHeight}`;
  }

  const width = asset.dimensions?.width ?? 0;
  const height = asset.dimensions?.height ?? 0;

  if (width > 0 && height > 0) {
    return `${width} / ${height}`;
  }

  if (asset.type === "icon") {
    return "1 / 1";
  }

  if (asset.type === "video") {
    return "16 / 10";
  }

  return "4 / 3";
}

function emitPreview(): void {
  emit("preview", props.asset);
}

function emitOpen(): void {
  emit("open", props.asset);
}

function emitPrimaryAction(): void {
  if (props.primaryAction === "open") {
    emitOpen();
    return;
  }
  emitPreview();
}

function emitCopyUrl(): void {
  emit("copyUrl", props.asset);
}

function emitRename(): void {
  emit("rename", props.asset);
}

function emitDuplicate(): void {
  emit("duplicate", props.asset);
}

function emitDelete(): void {
  emit("delete", props.asset);
}

function handleCardKeydown(event: KeyboardEvent): void {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  emitPrimaryAction();
}

function handlePreviewImageLoad(event: Event): void {
  const target = event.target;

  if (!(target instanceof HTMLImageElement)) {
    return;
  }

  if (target.naturalWidth <= 0 || target.naturalHeight <= 0) {
    return;
  }

  loadedPreviewDimensions.value = {
    width: target.naturalWidth,
    height: target.naturalHeight,
  };
}
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <article
        :class="{ 'page-card-enter': props.shouldAnimate }"
        :style="entranceStyle"
        :draggable="draggable"
        @dragstart="emit('dragStart', $event)"
        @dragend="emit('dragEnd')"
      >
        <div
          class="group relative overflow-hidden rounded-xl border border-solid border-border/50 bg-card/80 shadow-xs transition-[border-color,box-shadow,background-color] duration-150 ease-out hover:border-border hover:shadow-md"
          role="button"
          tabindex="0"
          @click="emitPrimaryAction"
          @keydown="handleCardKeydown"
        >
          <div
            v-if="sourceBadge"
            class="absolute left-3 top-3 z-30 rounded-md border border-border/50 bg-background/90 px-2 py-0.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground backdrop-blur-sm"
          >
            {{ sourceBadge }}
          </div>

          <div
            v-if="!readOnly"
            class="preview-actions absolute right-3 top-3 z-30 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
            @click.stop
          >
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button
                  variant="sidebar-action"
                  size="icon-sm"
                  class="shrink-0 w-8!"
                >
                  <span
                    :class="[studioIcons.moreHorizontal, 'size-4! p-0! shrink-0']"
                  />
                  <span class="sr-only">{{ t("media.actions") }}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                class="w-48"
                @click.stop
              >
                <DropdownMenuItem @click="emitPreview">
                  <span :class="[studioIcons.preview, 'mr-2 size-3.5 shrink-0']" />
                  {{ t("media.preview") }}
                </DropdownMenuItem>
                <DropdownMenuItem @click="emitCopyUrl">
                  <span :class="[studioIcons.link, 'mr-2 size-3.5 shrink-0']" />
                  {{ t("media.copyUrl") }}
                </DropdownMenuItem>
                <DropdownMenuItem @click="emitRename">
                  <span :class="[studioIcons.rename, 'mr-2 size-3.5 shrink-0']" />
                  {{ t("media.rename") }}
                </DropdownMenuItem>
                <DropdownMenuItem @click="emitDuplicate">
                  <span :class="[studioIcons.duplicate, 'mr-2 size-3.5 shrink-0']" />
                  {{ t("media.duplicate") }}
                </DropdownMenuItem>
                <DropdownMenuItem
                  v-if="canDelete"
                  variant="destructive"
                  @click="emitDelete"
                >
                  <span :class="[studioIcons.trash, 'mr-2 size-3.5 shrink-0']" />
                  {{ t("common.delete") }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div
            data-organizer-drag-preview
            class="relative overflow-hidden bg-background -m-px"
            :style="previewFrameStyle"
          >
            <div
              class="absolute inset-0 bg-[radial-gradient(circle_at_top,hsl(var(--foreground)/0.06),transparent_55%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--muted)/0.75))]"
            />

            <img
              v-if="showsImagePreview"
              :src="getThumbnailUrl(asset)"
              :alt="asset.name"
              draggable="false"
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
              :class="previewImageClass"
              @load="handlePreviewImageLoad"
              @error="(event) => handleThumbnailError(event, asset)"
            />

            <video
              v-else-if="showsVideoPreview"
              :key="previewSource"
              :src="previewSource"
              draggable="false"
              muted
              playsinline
              preload="metadata"
              referrerpolicy="no-referrer"
              class="h-full w-full object-cover"
            />

            <div v-else-if="isFont" class="h-full w-full">
              <FontAssetPreview :asset="asset" size="grid" />
            </div>

            <div
              v-else
              class="flex h-full w-full items-center justify-center px-6"
            >
              <div
                :class="[
                  getAssetIcon(asset.type),
                  'size-12 text-muted-foreground',
                ]"
              />
            </div>
          </div>
        </div>
      </article>
    </ContextMenuTrigger>

    <MediaContextMenuContent
      :can-delete="canDelete"
      :can-update-grouping="canUpdateGrouping"
      :custom-groups="customGroups"
      :current-group-id="currentGroupId"
      @preview="emitPreview"
      @copy-url="emitCopyUrl"
      @rename="emitRename"
      @duplicate="emitDuplicate"
      @delete="emitDelete"
      @move-to-group="(groupId) => emit('moveToGroup', groupId)"
    />
  </ContextMenu>
</template>
