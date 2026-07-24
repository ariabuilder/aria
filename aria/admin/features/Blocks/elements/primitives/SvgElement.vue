<script setup lang="ts">
import BaseElement from "../BaseElement.vue";
import { studioIcons } from "@/lib/icons";

const props = defineProps<{
  viewMode?: "grid" | "list";
}>();

const elementMeta = {
  name: "SVG",
  type: "svg",
  icon: studioIcons.design,
  category: "primitives",
};

const elementData = {
  type: "svg",
  props: {
    viewBox: "0 0 24 24",
    width: "48",
    height: "48",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.8",
    content:
      '<circle cx="12" cy="12" r="9"></circle><path d="M7 12h10"></path><path d="M12 7v10"></path>',
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
