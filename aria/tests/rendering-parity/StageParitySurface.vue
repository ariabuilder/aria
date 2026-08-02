<script setup lang="ts">
import { ref } from "vue";

import type { BuilderNode } from "../../lib/types/nodes";
import StageFrame from "../../admin/features/Stage/components/StageFrame.vue";

defineProps<{
  blocks: readonly BuilderNode[];
}>();

const ready = ref(false);
</script>

<template>
  <main
    id="parity-stage-host"
    :data-parity-ready="ready ? 'true' : 'false'"
  >
    <StageFrame
      :blocks="blocks"
      current-item-type="page"
      current-item-slug="rendering-parity"
      width="100%"
      height="100%"
      @ready="ready = true"
    />
  </main>
</template>

<style>
html,
body,
#parity-stage-host {
  width: 100%;
  height: 100%;
  margin: 0;
}

#parity-stage-host [data-overlay] {
  display: none !important;
}
</style>
