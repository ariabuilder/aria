<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import { studioIcons } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useInjectedPrefetchPageData } from "@/features/Core";
import { useStudioRouter } from "@/features/Studio/core/composables";
import { useStudioCapabilities } from "@/composables/useStudioCapabilities";
import type { StudioItemType } from "@/composables/useComposerAccess";
import { useStudioI18n } from "@/i18n";

interface Props {
  itemType: StudioItemType;
  slug: string;
  label?: string;
  class?: HTMLAttributes["class"];
}

const props = defineProps<Props>();
const { t } = useStudioI18n();
const buttonLabel = computed(() => props.label ?? t("pages.action.editInComposer"));

const router = useStudioRouter();
const caps = useStudioCapabilities();
const prefetchPageData = useInjectedPrefetchPageData();

function handlePrefetchIntent(): void {
  if (props.itemType === "page") {
    void prefetchPageData(props.slug);
  }
}

const showComposer = computed(
  () =>
    caps.isReady.value && caps.canEditItemInComposer(props.itemType),
);

function handleClick() {
  router.startEditing(props.itemType, props.slug);
}
</script>

<template>
  <Button
    v-if="showComposer"
    variant="composer"
    size="sm"
    @click="handleClick"
    @pointerenter="handlePrefetchIntent"
    @focus="handlePrefetchIntent"
  >
    {{ buttonLabel }}
  </Button>
</template>
