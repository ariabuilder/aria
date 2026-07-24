<script setup lang="ts">
import BaseElement from "../BaseElement.vue";
import { studioIcons } from "@/lib/icons";

const props = defineProps<{
  viewMode?: "grid" | "list";
}>();

const elementMeta = {
  name: "Component",
  type: "component",
  icon: studioIcons.component,
  category: "primitives",
};

const elementData = {
  type: "Component",
  props: {},
  styles: {},
  children: [],
  reference: {
    type: "instance",
    masterId: "",
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
