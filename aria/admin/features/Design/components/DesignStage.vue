<script setup lang="ts">
import DesignView from "../views/DesignView.vue";

const emit = defineEmits<{
  close: [];
}>();
</script>

<template>
  <div class="flex h-full w-full bg-background">
    <DesignView class="flex-1" />
  </div>
</template>
