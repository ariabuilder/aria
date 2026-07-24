<script setup lang="ts">
import { ref } from "vue";

const STORAGE_KEY = "aria:studio:left-rail-revealed:v1";

const shouldReveal = ref(false);

if (typeof window !== "undefined") {
  shouldReveal.value = window.localStorage.getItem(STORAGE_KEY) !== "true";
  if (shouldReveal.value) {
    window.localStorage.setItem(STORAGE_KEY, "true");
  }
}
</script>

<template>
  <div v-if="shouldReveal" class="studio-left-rail-reveal">
    <slot />
  </div>
  <slot v-else />
</template>
