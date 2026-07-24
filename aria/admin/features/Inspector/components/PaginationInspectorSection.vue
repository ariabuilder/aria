<script setup lang="ts">
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePaginationInspector } from "../composables/usePaginationInspector";
import { useStudioI18n } from "@/i18n";

const pagination = usePaginationInspector();
const { t } = useStudioI18n();
</script>

<template>
  <section
    v-if="pagination.isPaginationNode.value"
    class="space-y-4 border-t border-dashed border-border px-2 pt-4"
  >
    <div class="space-y-1">
      <h3 class="text-xs font-medium text-foreground">{{ t("inspector.pagination.title") }}</h3>
      <p class="text-3xs text-muted-foreground">
        {{ pagination.connectionLabel.value }}
      </p>
    </div>

    <div class="grid gap-2">
      <label class="text-3xs font-medium text-muted-foreground">{{ t("inspector.pagination.source") }}</label>
      <Select
        :model-value="pagination.connectedTargetId.value ?? '__none__'"
        @update:model-value="
          (value) => {
            if (value !== '__none__') {
              void pagination.connectToList(String(value));
            }
          }
        "
      >
        <SelectTrigger class="h-8 w-full text-xs">
          <SelectValue :placeholder="t('inspector.pagination.connect')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__" disabled>{{ t("inspector.pagination.chooseContainer") }}</SelectItem>
          <SelectItem
            v-for="option in pagination.listContainerOptions.value"
            :key="option.id"
            :value="option.id"
          >
            {{ option.label }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div class="grid gap-2">
      <label class="text-3xs font-medium text-muted-foreground">{{ t("inspector.pagination.perPage") }}</label>
      <p class="text-xs text-foreground">
        {{
          pagination.inheritedLimit.value
            ? t('inspector.pagination.inherit', { count: pagination.inheritedLimit.value })
            : t('inspector.pagination.inheritLimit')
        }}
      </p>
    </div>

    <div class="grid gap-2">
      <label class="text-3xs font-medium text-muted-foreground">{{ t("inspector.pagination.style") }}</label>
      <Select
        :model-value="pagination.paginationProps.value.style"
        @update:model-value="
          (value) => pagination.updatePaginationProp('style', String(value))
        "
      >
        <SelectTrigger class="h-8 w-full text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="numbers">{{ t("inspector.pagination.numbers") }}</SelectItem>
          <SelectItem value="prevNext">{{ t("inspector.pagination.prevNext") }}</SelectItem>
          <SelectItem value="loadMore">{{ t("inspector.pagination.loadMore") }}</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div
      v-if="pagination.paginationProps.value.style === 'numbers'"
      class="grid gap-2"
    >
      <label class="text-3xs font-medium text-muted-foreground">
        {{ t("inspector.pagination.pageButtons") }}
      </label>
      <input
        type="number"
        min="3"
        max="11"
        class="h-8 rounded-md border border-border bg-background px-2 text-xs"
        :value="pagination.paginationProps.value.maxPageButtons"
        @change="
          pagination.updatePaginationProp(
            'maxPageButtons',
            Number(($event.target as HTMLInputElement).value),
          )
        "
      />
    </div>
  </section>
</template>
