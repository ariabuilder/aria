<script setup lang="ts">
import { INSPECTOR_SECTION_HINT_CLASS } from "../../../constants/panelTokens";

interface Props {
  text: string;
}

defineProps<Props>();
</script>

<template>
  <p :class="INSPECTOR_SECTION_HINT_CLASS">
    {{ text }}
  </p>
</template>
