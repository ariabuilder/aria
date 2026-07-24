<script setup lang="ts">
import { computed, toRef } from "vue";
import { Skeleton } from "@/components/ui/skeleton";
import { useFontPreview } from "../composables";
import { getFontAssetFormat } from "../utils";
import type { MediaAsset } from "../types";

interface FontAssetPreviewProps {
  asset: MediaAsset;
  size?: "grid" | "list";
}

const props = withDefaults(defineProps<FontAssetPreviewProps>(), {
  size: "grid",
});

const assetRef = toRef(props, "asset");
const { previewFamily, isLoading, isReady, hasError, specimen } =
  useFontPreview(assetRef);

const assetDisplayName = computed(() => {
  const format = getFontAssetFormat(props.asset);
  if (!format) {
    return props.asset.name;
  }

  const extension = `.${format}`;
  return props.asset.name.toLowerCase().endsWith(extension)
    ? props.asset.name.slice(0, -extension.length)
    : props.asset.name;
});

const specimenClass = computed(() =>
  props.size === "grid"
    ? "text-6xl leading-none tracking-tight"
    : "text-6xl leading-none tracking-tight",
);

const containerClass = computed(() =>
  props.size === "grid"
    ? "h-full w-full items-center justify-center px-4 py-3"
    : "h-full w-full flex-row items-center justify-center px-2",
);

const fallbackClass = computed(() =>
  props.size === "grid" ? "text-3xl" : "text-sm",
);
</script>

<template>
  <div class="flex bg-sidebar/60 text-foreground" :class="containerClass">
    <template v-if="isLoading">
      <Skeleton
        v-if="size === 'grid'"
        class="h-14 w-20 rounded-lg bg-foreground/8"
      />
      <Skeleton v-else class="h-5 w-8 rounded bg-foreground/8" />
    </template>

    <template v-else-if="size === 'grid'">
      <div
        class="flex h-full w-full flex-col items-center justify-center gap-1.5 text-center"
      >
        <span
          :class="specimenClass"
          :style="
            isReady && previewFamily ? { fontFamily: previewFamily } : undefined
          "
        >
          {{ isReady && previewFamily ? specimen : "Aa" }}
        </span>
        <span
          class="max-w-full truncate text-sm font-medium text-foreground/80"
        >
          {{ assetDisplayName }}
        </span>
        <span v-if="hasError" class="text-xs text-muted-foreground">
          Preview unavailable
        </span>
      </div>
    </template>

    <template v-else-if="isReady && previewFamily">
      <span :class="specimenClass" :style="{ fontFamily: previewFamily }">
        {{ specimen }}
      </span>
    </template>

    <template v-else>
      <span class="font-serif text-muted-foreground" :class="fallbackClass">
        Aa
      </span>
    </template>
  </div>
</template>
