<script setup lang="ts">
import BaseElement from "../BaseElement.vue";
import { generateNodeId } from "../../../../../lib/ids/nodeId";
import { studioIcons } from "@/lib/icons";

const props = defineProps<{
  viewMode?: "grid" | "list";
}>();

const elementMeta = {
  name: "Section",
  type: "section",
  icon: studioIcons.section,
  category: "containers",
};

const elementData = {
  type: "section",
  props: {
    element: "section",
  },
  classNames: { base: [] },
  customClasses: [],
  children: [
    {
      id: generateNodeId(),
      type: "Container",
      props: {
        element: "div",
      },
      classNames: { base: [] },
      customClasses: [],
      children: [],
      styles: {},
    },
  ],
  styles: {},
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
