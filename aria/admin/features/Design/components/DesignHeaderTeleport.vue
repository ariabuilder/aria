<script setup lang="ts">
import { computed } from "vue";

import { useDesignHeaderTeleport } from "../composables/useDesignHeaderTeleport";
import type { DesignHeaderTeleportTarget } from "../types";

const props = defineProps<{
  target: DesignHeaderTeleportTarget;
}>();

const targets = useDesignHeaderTeleport();

const to = computed(() => targets[props.target].value);
</script>

<template>
  <Teleport :to="to" :disabled="!to">
    <slot />
  </Teleport>
</template>
