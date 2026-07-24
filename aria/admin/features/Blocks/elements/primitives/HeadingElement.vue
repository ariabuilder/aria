<script setup lang="ts">
import BaseElement from "../BaseElement.vue";
import { studioIcons } from "@/lib/icons";

const props = defineProps<{
  viewMode?: "grid" | "list";
}>();

const elementMeta = {
  name: "Heading",
  type: "heading",
  icon: studioIcons.text,
  category: "primitives",
};

const elementData = {
  type: "heading",
  props: {
    level: 2,
    text: "Add your heading here",
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
