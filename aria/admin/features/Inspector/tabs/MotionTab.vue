<script setup lang="ts">
import { ScrollArea } from "@/components/ui/scroll-area";
import MotionProperty from "../motion/inputs/MotionProperty.vue";
import { useInspectorState } from "../composables/useInspectorState";

interface Props {
  currentItemType?: "page" | "layout" | "component";
  currentItemSlug?: string;
}

const props = defineProps<Props>();
const { motionFocusNonce } = useInspectorState();
</script>

<template>
  <ScrollArea class="min-h-0 flex-1">
    <MotionProperty
      :current-item-type="props.currentItemType"
      :current-item-slug="props.currentItemSlug"
      :focus-nonce="motionFocusNonce"
    />
  </ScrollArea>
</template>
