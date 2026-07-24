<script setup lang="ts">
import { computed } from "vue";

import {
  getStudioTableColWidthStyle,
  type StudioTableHeaderTable,
} from "../lib/studioTableHeader";

const props = defineProps<{
  table: StudioTableHeaderTable;
}>();

const columns = computed(() => props.table.getVisibleLeafColumns());
</script>

<template>
  <colgroup>
    <col
      v-for="column in columns"
      :key="column.id"
      :style="getStudioTableColWidthStyle(column)"
    />
  </colgroup>
</template>
