<script setup lang="ts">
import BaseElement from "../BaseElement.vue";
import { studioIcons } from "@/lib/icons";

const props = defineProps<{
  viewMode?: "grid" | "list";
}>();

const elementMeta = {
  name: "Video",
  type: "video",
  icon: studioIcons.video,
  category: "primitives",
};

const elementData = {
  type: "video",
  props: {
    src: "",
    poster: "",
    alt: "",
    controls: true,
    muted: false,
    loop: false,
    autoplay: false,
    playsinline: false,
    preload: "metadata",
  },
  styles: {
    objectFit: { base: "cover" },
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
