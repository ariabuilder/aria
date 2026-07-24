<script setup lang="ts">
import ComponentPickerDialog from "../../Blocks/dialogs/ComponentPickerDialog.vue";
import type { AppChromeShellListeners, AppChromeShellProps } from "../../Core";

interface StageCommandRailProps {
  chromeProps: AppChromeShellProps;
  chromeListeners: AppChromeShellListeners;
}

const props = defineProps<StageCommandRailProps>();
</script>

<template>
  <ComponentPickerDialog
    v-if="props.chromeProps.pickerOpen"
    :open="props.chromeProps.pickerOpen"
    :components="props.chromeProps.components"
    @update:open="props.chromeListeners['update:picker-open']($event)"
    @select="props.chromeListeners['select-component']($event)"
  />
</template>
