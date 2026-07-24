<script setup lang="ts">
import { computed, ref, useAttrs } from "vue";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { studioIcons } from "@/lib/icons";
import type { CollectionSummary } from "../composables/useCollectionsList";
import { useStudioI18n } from "@/i18n";

defineOptions({
  inheritAttrs: false,
});

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    collections: readonly CollectionSummary[];
    disabled?: boolean;
    isLoading?: boolean;
    loadError?: string | null;
    placeholder?: string;
    emptyLabel?: string;
  }>(),
  {
    modelValue: "",
    disabled: false,
    isLoading: false,
    loadError: null,
    placeholder: "",
    emptyLabel: "",
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();
const { t } = useStudioI18n();

const attrs = useAttrs();
const open = defineModel<boolean>("open", { default: false });
const searchQuery = ref("");

const selectedCollection = computed(
  () =>
    props.collections.find(
      (collection) =>
        collection.id === props.modelValue || collection.name === props.modelValue,
    ) ??
    null,
);

const triggerLabel = computed(() => {
  if (selectedCollection.value) {
    return selectedCollection.value.label;
  }
  return props.modelValue || props.placeholder || t("cms.collectionPicker.choose");
});

const filteredCollections = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  if (!query) {
    return props.collections;
  }
  return props.collections.filter((collection) => {
    const haystack = [
      collection.label,
      collection.name,
      collection.kind,
      collection.id,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
});

function kindLabel(kind: CollectionSummary["kind"]): string {
  switch (kind) {
    case "content":
      return t("collections.kind.content");
    case "data":
      return t("collections.kind.data");
    case "config":
      return t("collections.kind.config");
    case "tags":
      return t("collections.kind.tags");
  }
}

function selectCollection(collection: CollectionSummary): void {
  emit("update:modelValue", collection.id);
  open.value = false;
  searchQuery.value = "";
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        v-bind="attrs"
        type="button"
        variant="outline"
        class="h-9! w-full min-w-0 justify-between rounded-sm bg-input! px-3 text-left text-xs font-normal"
        :disabled="disabled"
      >
        <span class="min-w-0 truncate">{{ triggerLabel }}</span>
        <span :class="[studioIcons.chevronDown, 'size-3.5 shrink-0 opacity-60']" />
      </Button>
    </PopoverTrigger>
    <PopoverContent
      data-cms-collection-picker-content
      align="start"
      class="w-[var(--reka-popover-trigger-width)] p-0"
      :side-offset="6"
    >
      <Command>
        <CommandInput v-model="searchQuery" :placeholder="t('cms.collectionPicker.search')" />
        <CommandList class="max-h-72">
          <CommandEmpty>{{ emptyLabel || t("cms.collectionPicker.empty") }}</CommandEmpty>
          <CommandGroup>
            <div
              v-if="loadError"
              class="px-3 py-4 text-xs text-destructive"
            >
              {{ loadError }}
            </div>
            <div
              v-else-if="isLoading"
              class="px-3 py-4 text-xs text-muted-foreground"
            >
              {{ t("cms.collectionPicker.loading") }}
            </div>
            <template v-else-if="filteredCollections.length > 0">
              <CommandItem
                v-for="collection in filteredCollections"
                :key="collection.id"
                :value="`${collection.label} ${collection.name} ${collection.kind} ${collection.id}`"
                class="gap-3"
                @pointerdown.prevent="selectCollection(collection)"
                @click.stop="selectCollection(collection)"
                @select="selectCollection(collection)"
              >
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm text-foreground">
                    {{ collection.label }}
                  </span>
                  <span class="block truncate text-2xs text-muted-foreground">
                    {{ collection.name }} · {{ kindLabel(collection.kind) }} ·
                    {{ t("cms.collectionPicker.entryCount", { count: collection.itemCount }) }}
                  </span>
                </span>
                <span
                  v-if="collection.id === modelValue || collection.name === modelValue"
                  :class="[studioIcons.check, 'size-3.5 shrink-0 text-primary']"
                />
              </CommandItem>
            </template>
            <div
              v-else
              class="px-3 py-4 text-xs text-muted-foreground"
            >
              {{ emptyLabel || t("cms.collectionPicker.empty") }}
            </div>
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
</template>
