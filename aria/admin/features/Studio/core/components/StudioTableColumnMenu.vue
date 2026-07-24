<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from "vue";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { studioIcons } from "@/lib/icons";
import { getStudioTableColumnLabel } from "../lib/studioTableHeader";
import HeaderActionDropdownTooltip from "./HeaderActionDropdownTooltip.vue";
import { useStudioI18n } from "@/i18n";

export interface StudioTableColumnMenuColumn {
  id: string;
  columnDef: {
    header?: unknown;
  };
  getIsVisible: () => boolean;
  toggleVisibility: () => void;
}

const props = withDefaults(
  defineProps<{
    columns: readonly StudioTableColumnMenuColumn[];
    lockedColumnIds?: readonly string[];
    label?: string;
    contentClass?: string;
  }>(),
  {
    lockedColumnIds: () => [],
    contentClass: "w-36",
  },
);

const emit = defineEmits<{
  reorder: [columns: StudioTableColumnMenuColumn[]];
}>();
const { t } = useStudioI18n();
const tooltipLabel = computed(() => props.label ?? t("common.columns"));

const Draggable = defineAsyncComponent(
  async () => (await import("vuedraggable")).default,
);

const menuColumns = ref<StudioTableColumnMenuColumn[]>([]);
const lockedColumnIdSet = computed(() => new Set(props.lockedColumnIds));

watch(
  () => props.columns,
  (columns) => {
    menuColumns.value = [...columns];
  },
  { immediate: true },
);

function isColumnLocked(column: StudioTableColumnMenuColumn): boolean {
  return lockedColumnIdSet.value.has(column.id);
}

function toggleColumn(column: StudioTableColumnMenuColumn): void {
  if (isColumnLocked(column)) {
    return;
  }

  column.toggleVisibility();
}

function emitReorder(): void {
  emit("reorder", [...menuColumns.value]);
}
</script>

<template>
  <HeaderActionDropdownTooltip :label="tooltipLabel">
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button variant="headerAction" size="icon-header">
          <span :class="[studioIcons.columns, 'size-3.5 shrink-0']" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" :class="contentClass">
        <Draggable
          :list="menuColumns"
          item-key="id"
          :animation="150"
          handle=".drag-handle"
          :force-fallback="true"
          :fallback-on-body="true"
          @end="emitReorder"
        >
          <template #item="{ element: column }">
            <div
              role="menuitemcheckbox"
              :aria-checked="column.getIsVisible()"
              tabindex="-1"
              class="group relative flex cursor-pointer select-none items-center gap-2 rounded-none border-b border-dashed border-border/50 px-3 py-2 text-xs text-muted-foreground outline-hidden transition-colors last:border-0 hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground dark:hover:bg-muted dark:focus:bg-muted"
              @click="toggleColumn(column)"
            >
              <span
                :class="[
                  studioIcons.dragHandle,
                  'drag-handle mr-1 size-3.5 cursor-grab text-muted-foreground opacity-30 active:cursor-grabbing group-hover:opacity-100',
                ]"
                @click.stop
              />
              <span
                v-if="column.getIsVisible()"
                :class="[studioIcons.check, 'mr-1.5 size-3.5 text-primary']"
              />
              <span v-else class="mr-1.5 w-3.5" />
              {{ getStudioTableColumnLabel(column) }}
            </div>
          </template>
        </Draggable>
      </DropdownMenuContent>
    </DropdownMenu>
  </HeaderActionDropdownTooltip>
</template>
