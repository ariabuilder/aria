<script setup lang="ts">
import { computed } from "vue";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import {
  StudioTableColGroup,
  StudioTableHeader,
} from "@/features/Studio/core/components";
import { toStudioTableHeaderTable } from "@/features/Studio/core/lib/studioTableHeader";
import { cn } from "@/lib/utils";
import { studioIcons } from "@/lib/icons";
import ComponentContentFieldCmsPicker, {
  type ContentFieldCmsBinding,
} from "./ComponentContentFieldCmsPicker.vue";
import { useComponentContentFieldsTable } from "../composables/useComponentContentFieldsTable";
import type {
  ComponentBindingTarget,
  ContentStructureNode,
  ContentFieldTypeFilter,
} from "../lib/componentContentStructure";

defineOptions({ name: "ComponentContentTree" });

const props = withDefaults(
  defineProps<{
    nodes: readonly ContentStructureNode[];
    values: Record<string, unknown>;
    bindings?: Record<string, ContentFieldCmsBinding>;
    previewValues?: Record<string, unknown>;
    disabled?: boolean;
    depth?: number;
    typeFilter?: ContentFieldTypeFilter;
  }>(),
  {
    bindings: () => ({}),
    previewValues: () => ({}),
    disabled: false,
    depth: 0,
    typeFilter: "all",
  },
);

const emit = defineEmits<{
  "update-field": [target: ComponentBindingTarget, value: string];
  "update-binding": [
    target: ComponentBindingTarget,
    value: ContentFieldCmsBinding | null,
  ];
}>();

const fields = computed(() =>
  flattenFields(props.nodes).filter(
    (field) => props.typeFilter === "all" || field.category === props.typeFilter,
  ),
);

const rows = computed(() =>
  fields.value.map((field) => ({
    id: field.id,
    target: field,
    category: field.category,
    value: fieldValue(field),
    binding: bindingValue(field),
    previewValue: previewValue(field),
  })),
);

const { table } = useComponentContentFieldsTable({ rows });

function flattenFields(
  nodes: readonly ContentStructureNode[],
): ComponentBindingTarget[] {
  return nodes.flatMap((node) => [
    ...node.fields,
    ...flattenFields(node.children),
  ]);
}

function fieldValue(target: ComponentBindingTarget): string {
  const value = props.values[target.id] ?? target.staticValue ?? "";
  return typeof value === "string" ? value : String(value);
}

function bindingValue(target: ComponentBindingTarget): ContentFieldCmsBinding | null {
  return props.bindings[target.id] ?? null;
}

function previewValue(target: ComponentBindingTarget): string {
  const value = props.previewValues[target.id];
  if (value === undefined || value === null || value === "") {
    return "";
  }
  return typeof value === "string" ? value : String(value);
}

function categoryLabel(target: ComponentBindingTarget): string {
  switch (target.category) {
    case "actions":
      return "Action";
    case "links":
      return "Link";
    case "media":
      return "Media";
    case "text":
      return "Text";
    default:
      return "Field";
  }
}

function categoryIcon(target: ComponentBindingTarget): string {
  switch (target.category) {
    case "actions":
      return studioIcons.buttonLayer;
    case "links":
      return studioIcons.link;
    case "media":
      return studioIcons.image;
    case "text":
      return studioIcons.text;
    default:
      return studioIcons.props;
  }
}

function contextLabel(target: ComponentBindingTarget): string {
  const source =
    target.kind === "schema-prop"
      ? "Schema"
      : target.nodeType || target.kind.replace("-", " ");
  return `${source} / ${target.propName}`;
}

function controlValue(target: ComponentBindingTarget): string {
  const binding = bindingValue(target);
  if (!binding) {
    return fieldValue(target);
  }
  return previewValue(target) || fieldValue(target);
}

function isLongTextField(target: ComponentBindingTarget): boolean {
  const propName = target.propName.toLowerCase();
  return (
    target.fieldType === "textarea" ||
    propName === "body" ||
    propName === "content" ||
    fieldValue(target).length > 96
  );
}

function isFieldDisabled(target: ComponentBindingTarget): boolean {
  return props.disabled || target.locked || Boolean(bindingValue(target));
}
</script>

<template>
  <div class="min-w-0 bg-background">
    <StudioTableHeader
      :table="toStudioTableHeaderTable(table)"
      :sticky="false"
      :get-head-cell-class="() => 'px-4'"
    />
    <Table class="w-full border-collapse table-fixed">
      <StudioTableColGroup :table="toStudioTableHeaderTable(table)" />
      <TableBody>
        <TableRow
          v-for="row in table.getRowModel().rows"
          :key="row.id"
          :class="
            cn(
              'border-b border-dashed border-border/50 hover:bg-sidebar/30 last:border-b-0',
              row.original.target.locked && 'bg-muted/15 text-muted-foreground',
            )
          "
        >
          <TableCell
            v-for="cell in row.getVisibleCells()"
            :key="cell.id"
            :class="
              cn(
                'h-13 px-4 py-2 align-middle',
                cell.column.id === 'field' && 'min-w-0',
                cell.column.id === 'value' && 'min-w-0',
                cell.column.id === 'source' && 'min-w-0',
                cell.column.id === 'status' && 'text-right',
              )
            "
          >
            <template v-if="cell.column.id === 'field'">
              <div class="flex min-w-0 items-center gap-2">
                <span
                  :class="[
                    categoryIcon(row.original.target),
                    'size-3.5 shrink-0 text-muted-foreground/70',
                  ]"
                />
                <div class="min-w-0">
                  <div class="truncate text-xs text-foreground">
                    {{ row.original.target.label }}
                  </div>
                  <div class="truncate text-3xs text-muted-foreground/70">
                    {{ categoryLabel(row.original.target) }} ·
                    {{ contextLabel(row.original.target) }}
                  </div>
                </div>
              </div>
            </template>

            <template v-else-if="cell.column.id === 'value'">
              <div class="relative min-w-0">
                <Textarea
                  v-if="isLongTextField(row.original.target)"
                  :model-value="controlValue(row.original.target)"
                  auto-grow
                  class="min-h-8! py-1.5 pr-9 text-xs"
                  :disabled="isFieldDisabled(row.original.target)"
                  @update:model-value="
                    (value) =>
                      emit('update-field', row.original.target, String(value))
                  "
                />
                <Input
                  v-else
                  :model-value="controlValue(row.original.target)"
                  class="h-8! pr-9 text-xs"
                  :disabled="isFieldDisabled(row.original.target)"
                  @update:model-value="
                    (value) =>
                      emit('update-field', row.original.target, String(value))
                  "
                />
                <div
                  v-if="row.original.target.bindable"
                  :class="
                    cn(
                      'absolute right-2 z-10 flex items-center',
                      isLongTextField(row.original.target)
                        ? 'top-2'
                        : 'top-1/2 -translate-y-1/2',
                    )
                  "
                >
                  <ComponentContentFieldCmsPicker
                    :model-value="row.original.binding"
                    :disabled="disabled || row.original.target.locked"
                    trigger-class="size-6 rounded-md border-0 bg-transparent"
                    @select="
                      (binding) =>
                        emit('update-binding', row.original.target, binding)
                    "
                  />
                </div>
              </div>
            </template>

            <template v-else-if="cell.column.id === 'source'">
              <div v-if="row.original.binding" class="min-w-0">
                <div class="truncate text-2xs text-primary">
                  {{ row.original.binding.fullPath }}
                </div>
                <div
                  v-if="row.original.previewValue"
                  class="truncate text-3xs text-muted-foreground/70"
                >
                  {{ row.original.previewValue }}
                </div>
              </div>
              <span v-else class="text-2xs text-muted-foreground/60">
                Static
              </span>
            </template>

            <template v-else-if="cell.column.id === 'status'">
              <span
                v-if="row.original.target.locked"
                :class="[studioIcons.lock, 'inline-block size-3.5 text-muted-foreground']"
                title="Locked"
              />
            </template>

          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
</template>
