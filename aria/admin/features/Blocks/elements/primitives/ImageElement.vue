<script setup lang="ts">
import BaseElement from "../BaseElement.vue";
import { studioIcons } from "@/lib/icons";

const props = defineProps<{
  viewMode?: "grid" | "list";
}>();

const elementMeta = {
  name: "Image",
  type: "image",
  icon: studioIcons.galleryLinear,
  category: "primitives",
};

const elementData = {
  type: "image",
  props: {
    src: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800",
    alt: "",
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
