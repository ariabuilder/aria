<script setup lang="ts">
import BaseElement from "../BaseElement.vue";
import { createIconListNode } from "@/lib/blocks/listNodes";
import { studioIcons } from "@/lib/icons";

const props = defineProps<{
  viewMode?: "grid" | "list";
}>();

const elementMeta = {
  name: "Icon List",
  type: "list",
  icon: studioIcons.checkCircleLinear,
  category: "primitives",
};

const elementData = createIconListNode({
  items: ["First item", "Second item", "Third item"],
});

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
