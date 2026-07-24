<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { VisuallyHidden } from "reka-ui";
import { formatFileSize, getAssetIcon, getThumbnailUrl } from "../utils";
import {
  isRemoteImagePreviewUrl,
  isRemoteVideoPreviewUrl,
} from "../../../../../lib/media/utils/mediaType";
import type { MediaAsset } from "../types";
import { useStudioI18n } from "@/i18n";

interface Props {
  open: boolean;
  asset: MediaAsset | null;
}

const props = defineProps<Props>();
const { t } = useStudioI18n();

const resolvedDimensions = ref<MediaAsset["dimensions"] | null>(null);

watch(
  () => props.asset,
  (asset) => {
    resolvedDimensions.value = asset?.dimensions ?? null;
  },
  { immediate: true },
);

const dimensionsLabel = computed(() => {
  if (!resolvedDimensions.value) {
    return "—";
  }

  return `${resolvedDimensions.value.width} × ${resolvedDimensions.value.height}`;
});

const previewSource = computed(() => {
  if (!props.asset) {
    return "";
  }

  return getThumbnailUrl(props.asset);
});

const showsImagePreview = computed(() => {
  if (!props.asset) {
    return false;
  }

  if (props.asset.type === "image" || props.asset.type === "icon") {
    return true;
  }

  return isRemoteImagePreviewUrl(previewSource.value);
});

const showsVideoPreview = computed(() => {
  if (!props.asset) {
    return false;
  }

  if (props.asset.type === "video") {
    return true;
  }

  return isRemoteVideoPreviewUrl(previewSource.value);
});

function handleImageLoad(event: Event) {
  if (props.asset?.dimensions) {
    resolvedDimensions.value = props.asset.dimensions;
    return;
  }

  const image = event.currentTarget;
  if (!(image instanceof HTMLImageElement)) {
    return;
  }

  if (image.naturalWidth > 0 && image.naturalHeight > 0) {
    resolvedDimensions.value = {
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  }
}

defineEmits<{
  "update:open": [value: boolean];
}>();
</script>

<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent
      class="w-full max-w-none! sm:max-w-none! p-0 gap-0 overflow-hidden bg-background border border-dashed border-border [&>button]:top-3 [&>button]:right-3 [&>button]:text-muted-foreground [&>button]:opacity-90 [&>button]:hover:opacity-100"
      :style="{ width: 'min(90vw, 860px)', maxWidth: 'min(90vw, 860px)' }"
      :aria-describedby="undefined"
    >
      <VisuallyHidden>
        <DialogTitle>{{ asset?.name ?? t("media.preview") }}</DialogTitle>
        <DialogDescription>{{ t("media.previewDescription") }}</DialogDescription>
      </VisuallyHidden>
      <div v-if="asset" class="p-0 space-y-2">
        <div
          class="rounded-md border border-dashed border-border overflow-hidden flex items-center justify-center min-h-80"
        >
          <img
            v-if="showsImagePreview"
            :key="previewSource"
            :src="previewSource"
            :alt="asset.name"
            referrerpolicy="no-referrer"
            class="max-h-[65vh] w-auto max-w-full object-contain"
            @load="handleImageLoad"
          />
          <video
            v-else-if="showsVideoPreview"
            :key="previewSource"
            :src="previewSource"
            controls
            referrerpolicy="no-referrer"
            class="max-h-[65vh] w-full max-w-full"
          />
          <div
            v-else
            class="w-full h-80 flex flex-col items-center justify-center text-muted-foreground"
          >
            <div :class="[getAssetIcon(asset.type), 'w-10 h-10 mb-2']" />
            <p class="text-sm">{{ t("media.previewUnsupported") }}</p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div
            class="rounded-md border border-solid border-border bg-background px-3"
          >
            <p
              class="text-2xs uppercase tracking-wide text-muted-foreground mb-1"
            >
              {{ t("media.name") }}
            </p>
            <p class="text-xs text-foreground break-all">
              {{ asset.name }}
            </p>
          </div>

          <div
            class="rounded-md border border-solid border-border bg-background px-3 py-0"
          >
            <p
              class="text-2xs uppercase tracking-wide text-muted-foreground mb-1"
            >
              {{ t("media.size") }}
            </p>
            <p class="text-xs text-foreground">
              {{ formatFileSize(asset.size) }}
            </p>
          </div>

          <div
            class="rounded-md border border-solid border-border bg-background px-3 py-0"
          >
            <p
              class="text-2xs uppercase tracking-wide text-muted-foreground mb-1"
            >
              {{ t("media.dimensions") }}
            </p>
            <p class="text-xs text-foreground">
              {{ dimensionsLabel }}
            </p>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
