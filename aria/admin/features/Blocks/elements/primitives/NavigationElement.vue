<script setup lang="ts">
import BaseElement from "../BaseElement.vue";
import { studioIcons } from "@/lib/icons";
import { createNavigationNode } from "@/lib/blocks/navigationNodes";

const props = defineProps<{
  viewMode?: "grid" | "list";
}>();

const elementMeta = {
  name: "Navigation",
  type: "navigation",
  icon: studioIcons.menu01,
  category: "primitives",
};

const elementData = createNavigationNode();

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
