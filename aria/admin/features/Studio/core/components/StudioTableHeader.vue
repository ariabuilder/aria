<script setup lang="ts">
import { FlexRender, type Column } from "@tanstack/vue-table";
import { computed } from "vue";

import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { studioIcons } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { isStudioTableSortableColumn, getStudioTableColWidthStyle, type StudioTableHeaderTable } from "../lib/studioTableHeader";
import StudioTableColGroup from "./StudioTableColGroup.vue";

const props = withDefaults(
  defineProps<{
    table: StudioTableHeaderTable;
    getHeadCellClass?: (columnId: string) => string | undefined;
    sticky?: boolean;
    tableClass?: string;
  }>(),
  {
    sticky: true,
    tableClass: "",
  },
);

const headerGroups = computed(() => props.table.getHeaderGroups());

function getHeadClass(columnId: string, canSort: boolean): string {
  const isSelect = columnId === "select";

  return cn(
    "sticky h-9 px-4 py-2.5 text-2xs font-mono font-regular tracking-wider select-none bg-card/20!",
    isSelect
      ? "text-muted-foreground/50"
      : "text-muted-foreground/50 cursor-pointer hover:bg-card/50! hover:text-muted-foreground transition-colors",
    !canSort && !isSelect && "cursor-default hover:bg-input!",
    props.getHeadCellClass?.(columnId),
  );
}

function handleHeadClick(
  column: Column<unknown, unknown>,
  event: MouseEvent,
): void {
  if (
    !isStudioTableSortableColumn(column.id) ||
    !column.getCanSort()
  ) {
    return;
  }

  column.toggleSorting(undefined, event.shiftKey);
}
</script>

<template>
  <div
    :class="
      cn(
        'border-y border-dashed border-border bg-background',
        props.sticky ? 'sticky top-0 z-20' : undefined,
      )
    "
  >
    <Table
      :class="cn('w-full border-collapse table-fixed', props.tableClass)"
    >
      <StudioTableColGroup :table="props.table" />
      <TableHeader class="[&_tr]:border-b-0!">
        <TableRow
          v-for="headerGroup in headerGroups"
          :key="headerGroup.id"
          class="border-b-0! hover:bg-transparent"
        >
          <TableHead
            v-for="header in headerGroup.headers"
            :key="header.id"
            :data-column-id="header.column.id"
            :style="getStudioTableColWidthStyle(header.column)"
            :class="getHeadClass(header.column.id, header.column.getCanSort())"
            @click="
              handleHeadClick(
                header.column,
                $event,
              )
            "
          >
            <template v-if="!header.isPlaceholder">
              <div class="flex items-center gap-2">
                <FlexRender
                  :render="header.column.columnDef.header"
                  :props="header.getContext()"
                />
                <span
                  v-if="header.column.getIsSorted() === 'asc'"
                  :class="[studioIcons.chevronUp, 'size-3 text-primary']"
                />
                <span
                  v-else-if="header.column.getIsSorted() === 'desc'"
                  :class="[studioIcons.chevronDown, 'size-3 text-primary']"
                />
              </div>
            </template>
          </TableHead>
        </TableRow>
      </TableHeader>
    </Table>
  </div>
</template>
