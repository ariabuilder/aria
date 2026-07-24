<script setup lang="ts">
import BaseElement from "../BaseElement.vue";
import { studioIcons } from "@/lib/icons";
import { createListNode } from "@/lib/blocks/listNodes";

const props = defineProps<{
  viewMode?: "grid" | "list";
}>();

const elementMeta = {
  name: "List",
  type: "list",
  icon: studioIcons.list,
  category: "primitives",
};

const elementData = createListNode({
  ordered: false,
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
