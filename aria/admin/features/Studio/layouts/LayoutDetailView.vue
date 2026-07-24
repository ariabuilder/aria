<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { Button } from "@/components/ui/button";
import { useBuilderData } from "@/composables/useBuilderData";
import { useStudioRouter } from "@/features/Studio/core/composables";
import LayoutConfigPanel from "@/features/Studio/layouts/components/LayoutConfigPanel.vue";
import LayoutLocalizationPanel from "@/features/Studio/layouts/components/LayoutLocalizationPanel.vue";
import { studioIcons } from "@/lib/icons";

defineOptions({ name: "LayoutDetailView" });

const route = useRoute();
const router = useStudioRouter();
const { layouts } = useBuilderData();

const layoutId = computed(() => String(route.params.slug ?? ""));

const layoutMeta = computed(() =>
  layouts.value.find((layout) => layout.id === layoutId.value),
);

const layoutTitle = computed(
  () => layoutMeta.value?.name || layoutMeta.value?.title || layoutId.value,
);

function handleBack(): void {
  router.navigateTo("/layouts");
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background">
    <header
      class="flex shrink-0 items-center justify-between border-b border-dashed border-border px-6 py-3"
    >
      <div class="flex min-w-0 items-center gap-3">
        <Button variant="outline" size="icon-sm" @click="handleBack">
          <span :class="[studioIcons.chevronLeft, 'size-4']" />
        </Button>
        <div class="min-w-0">
          <nav class="mb-0.5 flex items-center gap-2 text-sm">
            <button
              type="button"
              class="shrink-0 text-muted-foreground transition-colors hover:text-primary"
              @click="handleBack"
            >
              Layouts
            </button>
            <span class="shrink-0 text-muted-foreground/50">/</span>
            <span class="truncate font-medium text-foreground">
              {{ layoutTitle || "Layout" }}
            </span>
          </nav>
          <p class="text-2xs font-mono text-muted-foreground">
            {{ layoutId }}
          </p>
        </div>
      </div>
    </header>

    <div class="min-h-0 flex-1 overflow-auto">
      <LayoutConfigPanel
        v-if="layoutId"
        :layout-id="layoutId"
        class="min-h-[30rem]"
      />
      <div v-if="layoutId" class="px-4 pb-6">
        <LayoutLocalizationPanel :layout-id="layoutId" />
      </div>
    </div>
  </div>
</template>
