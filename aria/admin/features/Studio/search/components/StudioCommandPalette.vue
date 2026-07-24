<script setup lang="ts">
/**
 * StudioCommandPalette — site-wide command search (⌘K). Navigates
 * studio sections, opens settings, searches pages/layouts/components, and.
 */

import { computed, ref } from "vue";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useStudioI18n } from "@/i18n";
import { useSearchDialog } from "../composables/useSearchDialog";
import { useCmsCommandPaletteEntries } from "../composables/useCmsCommandPaletteEntries";
import { useStudioCommandPalette } from "../composables/useStudioCommandPalette";
import {
  CommandPaletteCmsEntryItemSchema,
  CommandPaletteCmsCollectionItemSchema,
  mapComponentsToPaletteItems,
  mapLayoutsToPaletteItems,
  mapPagesToPaletteItems,
  type CommandPaletteItem,
} from "../schemas/commandPalette";

const props = withDefaults(
  defineProps<{
    pages?: ReadonlyArray<{ slug: string; title: string }>;
    layouts?: ReadonlyArray<{
      id: string;
      name: string;
      title?: string;
      description?: string;
    }>;
    components?: ReadonlyArray<{
      id: string;
      name: string;
      description?: string;
    }>;
    isLoading?: boolean;
  }>(),
  {
    pages: () => [],
    layouts: () => [],
    components: () => [],
    isLoading: false,
  },
);

const searchDialog = useSearchDialog();
const { t } = useStudioI18n();
const searchQuery = ref("");

const palettePages = computed(() => mapPagesToPaletteItems(props.pages));
const paletteLayouts = computed(() => mapLayoutsToPaletteItems(props.layouts));
const paletteComponents = computed(() =>
  mapComponentsToPaletteItems(props.components),
);
const cmsEntries = useCmsCommandPaletteEntries(searchQuery);
const paletteCmsEntries = computed(() =>
  CommandPaletteCmsEntryItemSchema.array().parse(
    cmsEntries.visibleEntries.value,
  ),
);
const paletteCmsCollections = computed(() =>
  CommandPaletteCmsCollectionItemSchema.array().parse(
    cmsEntries.visibleCollections.value,
  ),
);
const isPaletteLoading = computed(
  () => props.isLoading || cmsEntries.isLoading.value,
);

const { groupedItems } = useStudioCommandPalette({
  pages: palettePages,
  layouts: paletteLayouts,
  components: paletteComponents,
  cmsEntries: paletteCmsEntries,
  cmsCollections: paletteCmsCollections,
  isLoading: isPaletteLoading,
  searchQuery,
  close: () => searchDialog.close(),
});

const paletteOpen = computed({
  get: () => searchDialog.isOpen.value,
  set: (open: boolean) => {
    if (open) {
      searchDialog.open();
      return;
    }
    searchQuery.value = "";
    searchDialog.close();
  },
});

function handleSelect(item: CommandPaletteItem): void {
  if (item.id === "loading") {
    return;
  }
  void item.action();
}

defineExpose({
  open: searchDialog.open,
  close: searchDialog.close,
});
</script>

<template>
  <CommandDialog
    v-model:open="paletteOpen"
    :title="t('commandSearch.title')"
    :description="t('commandSearch.description')"
  >
    <CommandInput
      v-model="searchQuery"
      auto-focus
      :placeholder="t('commandSearch.placeholder')"
      class="text-sm border-0 h-10!"
    />
    <CommandList
      class="overflow-y-auto transition-all duration-100 ease-in-out min-h-80 max-h-[460px] py-3"
    >
      <CommandEmpty class="text-muted-foreground py-10 bg-sidebar">
        {{ t("commandSearch.noResults") }}
      </CommandEmpty>
      <CommandGroup
        v-for="(items, category) in groupedItems"
        :key="category"
        :heading="category"
      >
        <CommandItem
          v-for="item in items"
          :key="item.id"
          :value="item.id"
          :force-visible="item.serverMatched"
          class="cursor-pointer gap-3"
          @select="handleSelect(item)"
        >
          <div :class="[item.icon, 'h-4 w-4 text-muted-foreground']" />
          <div class="flex-1 min-w-0">
            <div class="truncate text-xs font-medium">{{ item.label }}</div>
            <div
              v-if="item.description"
              class="text-2xs text-muted-foreground truncate"
            >
              {{ item.description }}
            </div>
          </div>
        </CommandItem>
      </CommandGroup>
    </CommandList>
  </CommandDialog>
</template>
