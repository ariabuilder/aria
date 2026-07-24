<script setup lang="ts">
import { computed } from "vue";
import ErrorBanner from "@/features/Studio/core/components/ErrorBanner.vue";
import MediaGridCard from "@/features/Studio/media/components/MediaGridCard.vue";
import {
  toMediaAssetForPreview,
  type GetPageMediaOutput,
  type PageMediaDisplayItem,
} from "@/lib/schemas/pageMedia";
import type { PageDetailError } from "@/lib/errors/pageDetailErrors";
import { studioIcons } from "@/lib/icons";
import "@/features/Studio/media/styles/media-masonry.css";
import { useStudioI18n } from "@/i18n";

const props = defineProps<{
  currentError: PageDetailError | null;
  media: GetPageMediaOutput | null;
  displayItems: PageMediaDisplayItem[];
  isLoading: boolean;
}>();
const { t } = useStudioI18n();

const emit = defineEmits<{
  dismissError: [];
  retryLoad: [];
  preview: [item: PageMediaDisplayItem];
}>();

const masonryItems = computed(() =>
  props.displayItems.filter(
    (item) =>
      item.type === "image" ||
      item.type === "video" ||
      item.type === "icon",
  ),
);

const standardItems = computed(() =>
  props.displayItems.filter(
    (item) =>
      item.type !== "image" &&
      item.type !== "video" &&
      item.type !== "icon",
  ),
);

const isEmpty = computed(
  () => !props.isLoading && props.displayItems.length === 0,
);

const hasOnlyExternalOrMissing = computed(
  () =>
    !props.isLoading &&
    props.displayItems.length > 0 &&
    props.media !== null &&
    props.media.assets.length === 0,
);

function sourceBadgeFor(item: PageMediaDisplayItem): string | null {
  if (item.source === "external") {
    return t("pages.media.external");
  }
  if (item.source === "missing") {
    return t("pages.media.notInLibrary");
  }
  return null;
}

function onPreview(item: PageMediaDisplayItem): void {
  emit("preview", item);
}
</script>

<template>
  <div class="space-y-4">
    <ErrorBanner
      :error="currentError"
      @dismiss="emit('dismissError')"
      @retry="emit('retryLoad')"
    />

    <div
      v-if="media?.truncated"
      class="rounded-md border border-dashed border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-300"
    >
      {{ t("pages.media.truncated") }}
    </div>

    <div
      v-if="media && media.missingComponents.length > 0"
      class="rounded-md border border-dashed border-border bg-muted/30 px-4 py-2 text-sm text-muted-foreground"
    >
      {{
        media.missingComponents.length === 1
          ? t("pages.media.missingOne")
          : t("pages.media.missingMany", { count: media.missingComponents.length })
      }}
    </div>

    <div v-if="isLoading" class="flex items-center justify-center py-16">
      <span
        :class="[
          studioIcons.refreshLine,
          'size-6 shrink-0 text-muted-foreground animate-spin',
        ]"
      />
    </div>

    <div
      v-else-if="isEmpty"
      class="flex flex-col items-center justify-center py-16 text-center"
    >
      <span
        :class="[studioIcons.media, 'size-8 shrink-0 text-muted-foreground mb-2']"
      />
      <p class="text-sm text-muted-foreground">
        {{ t("pages.media.empty") }}
      </p>
    </div>

    <template v-else>
      <p
        v-if="hasOnlyExternalOrMissing"
        class="text-xs text-muted-foreground"
      >
        {{ t("pages.media.externalNotice") }}
      </p>

      <div
        v-if="masonryItems.length > 0"
        class="media-masonry media-masonry--compact"
      >
        <div
          v-for="(item, index) in masonryItems"
          :key="`${item.source}-${item.id}-${index}`"
          class="media-masonry-item"
        >
          <MediaGridCard
            :asset="toMediaAssetForPreview(item)"
            :index="index"
            read-only
            :can-delete="false"
            :source-badge="sourceBadgeFor(item)"
            @preview="onPreview(item)"
          />
        </div>
      </div>

      <div
        v-if="standardItems.length > 0"
        :class="[
          'media-standard-grid media-standard-grid--compact',
          masonryItems.length > 0 ? 'mt-4' : '',
        ]"
      >
        <div
          v-for="(item, index) in standardItems"
          :key="`${item.source}-${item.id}-${index}`"
          class="min-w-0"
        >
          <MediaGridCard
            :asset="toMediaAssetForPreview(item)"
            :index="index"
            read-only
            :can-delete="false"
            :source-badge="sourceBadgeFor(item)"
            @preview="onPreview(item)"
          />
        </div>
      </div>
    </template>
  </div>
</template>
