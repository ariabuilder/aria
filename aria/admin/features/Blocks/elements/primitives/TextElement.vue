<script setup lang="ts">
import BaseElement from "../BaseElement.vue";
import { studioIcons } from "@/lib/icons";

const props = defineProps<{
  viewMode?: "grid" | "list";
}>();

/**
 * Text Element - Clean, reusable component definition
 *
 * Just defines the element data and preview.
 * Parent handles all interactions (drag, click).
 */

const elementMeta = {
  name: "Text",
  type: "text",
  icon: studioIcons.text,
  category: "primitives",
};

const elementData = {
  type: "text",
  props: {
    content: "Add your text here...",
  },
};

defineExpose({
  elementMeta,
  elementData,
});
</script>

<template>
  <BaseElement
    :icon="elementMeta.icon"
    :label="elementMeta.name"
    :view-mode="props.viewMode"
  />
</template>
