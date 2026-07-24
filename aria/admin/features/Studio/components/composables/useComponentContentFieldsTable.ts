import {
  createColumnHelper,
  getCoreRowModel,
  useVueTable,
  type ColumnDef,
} from "@tanstack/vue-table";
import { computed, type Ref } from "vue";

import type {
  ComponentBindingTarget,
  ContentFieldCategory,
} from "../lib/componentContentStructure";
import type { ContentFieldCmsBinding } from "../components/ComponentContentFieldCmsPicker.vue";

export interface ComponentContentFieldRow {
  id: string;
  target: ComponentBindingTarget;
  category: ContentFieldCategory;
  value: string;
  binding: ContentFieldCmsBinding | null;
  previewValue: string;
}

export interface UseComponentContentFieldsTableOptions {
  rows: Ref<ComponentContentFieldRow[]>;
}

const columnHelper = createColumnHelper<ComponentContentFieldRow>();

export function useComponentContentFieldsTable(
  options: UseComponentContentFieldsTableOptions,
) {
  const columns = computed<ColumnDef<ComponentContentFieldRow, unknown>[]>(() => [
    columnHelper.display({
      id: "field",
      header: "Field",
      size: 260,
      minSize: 220,
      meta: { studioTableWidthMode: "min" },
      enableSorting: false,
    }),
    columnHelper.display({
      id: "value",
      header: "Value",
      minSize: 320,
      meta: { studioTableWidthMode: "flex" },
      enableSorting: false,
    }),
    columnHelper.display({
      id: "source",
      header: "Source",
      size: 240,
      minSize: 200,
      meta: { studioTableWidthMode: "min" },
      enableSorting: false,
    }),
    columnHelper.display({
      id: "status",
      header: "",
      size: 72,
      minSize: 64,
      meta: { studioTableWidthMode: "fixed" },
      enableSorting: false,
    }),
  ] satisfies ColumnDef<ComponentContentFieldRow, unknown>[]);

  const table = useVueTable<ComponentContentFieldRow>({
    get data() {
      return options.rows.value;
    },
    get columns() {
      return columns.value;
    },
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  return { table };
}
