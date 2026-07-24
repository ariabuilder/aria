<script setup lang="ts">
import BaseElement from "../BaseElement.vue";
import { studioIcons } from "@/lib/icons";

const props = defineProps<{
  viewMode?: "grid" | "list";
}>();

const elementMeta = {
  name: "Icon",
  type: "icon",
  icon: studioIcons.star,
  category: "primitives",
};

const elementData = {
  type: "icon",
  props: {
    icon: {
      id: "lucide:star",
      pack: "lucide",
      name: "star",
      source: "iconify",
      version: "2026-06-24-local",
    },
    ariaLabel: "Icon",
  },
  styles: {
    width: { base: "40px" },
    height: { base: "40px" },
    fontSize: { base: "40px" },
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
