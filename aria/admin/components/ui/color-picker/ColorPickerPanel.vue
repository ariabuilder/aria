<script setup lang="ts">
import {
  COLOR_PICKER_PANEL_CLASS,
  COLOR_PICKER_SHELL_CLASS,
} from "./panel.tokens";
</script>

<template>
  <div :class="COLOR_PICKER_SHELL_CLASS">
    <div :class="COLOR_PICKER_PANEL_CLASS">
      <slot />
    </div>
  </div>
</template>
