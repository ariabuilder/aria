<script setup lang="ts">
import BaseElement from "../BaseElement.vue";
import { studioIcons } from "@/lib/icons";

const props = defineProps<{
  viewMode?: "grid" | "list";
}>();

const elementMeta = {
  name: "Container",
  type: "container",
  icon: studioIcons.element,
  category: "containers",
};

const elementData = {
  type: "container",
  props: {
    element: "div",
  },
  classNames: { base: [] },
  customClasses: [],
  styles: {},
  children: [],
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
