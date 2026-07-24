<script setup lang="ts">
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ComponentPreviewCard from "@/features/Studio/components/components/ComponentPreviewCard.vue";

interface Props {
  componentId: string;
  componentSource?: "custom" | "aria";
  componentTier?: "free" | "pro";
  componentLocked?: boolean;
  isThumbnailPending?: boolean;
  thumbnailUrl?: string | null;
  thumbnailRefreshToken?: string | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  refreshThumbnail: [];
}>();
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background">
    <div
      class="flex shrink-0 items-center justify-between border-b border-dashed border-border px-4 py-3"
    >
      <div class="min-w-0">
        <p
          class="text-lg font-serif font-regular tracking-wide text-muted-foreground select-none"
          style="view-transition-name: component-preview-title"
        >
          Component Preview
        </p>
        <div class="mt-1 flex items-center gap-1.5">
          <Badge
            :variant="componentSource === 'aria' ? 'secondary' : 'outline'"
            class="h-4 px-1 text-4xs"
          >
            {{ componentSource === "aria" ? "Aria Library" : "Personal" }}
          </Badge>
        </div>
      </div>

      <div class="flex items-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="size-8 p-0"
          data-test="refresh-thumbnail-button"
          :disabled="isThumbnailPending"
          :title="
            isThumbnailPending
              ? 'Regenerating thumbnail'
              : 'Regenerate thumbnail'
          "
          @click="emit('refreshThumbnail')"
        >
          <div
            class="i-hugeicons:refresh w-5 h-5"
            :class="{ 'animate-spin': isThumbnailPending }"
          />
        </Button>
      </div>
    </div>

    <div class="flex min-h-0 flex-1 overflow-hidden bg-muted/20">
      <div class="h-full min-h-0 w-full" style="view-transition-name: component-preview">
        <ComponentPreviewCard
          variant="lg"
          :component-id="componentId"
          :name="componentId"
          :thumbnail-url="thumbnailUrl"
          :thumbnail-refresh-token="thumbnailRefreshToken"
          fill-preview
          inert
          :show-meta="false"
          thumbnail-fit="cover"
          eager
          class="!rounded-none !border-0"
        />
      </div>
    </div>
  </div>
</template>
