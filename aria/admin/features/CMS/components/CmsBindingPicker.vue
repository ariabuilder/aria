<script setup lang="ts">
import { computed, ref, watch } from "vue";
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
import { usePropsEditor } from "@/features/Inspector/composables/usePropsEditor";
import {
  resolveInspectorBindingPickerInitialPage,
  type InspectorBindingPickerPage,
} from "@/features/Inspector/composables/useInspectorPropBinding";
import type {
  CmsBindingFieldOption,
  CmsBindingFieldOptionGroup,
} from "@/features/Inspector/composables/usePropsEditor";

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    groups: readonly CmsBindingFieldOptionGroup[];
    disabled?: boolean;
    placeholder?: string;
    displayLabel?: string;
    emptyLabel?: string;
    active?: boolean;
  }>(),
  {
    modelValue: "",
    disabled: false,
    placeholder: "Choose field",
    displayLabel: "",
    emptyLabel: "No fields found.",
    active: false,
  },
);

const emit = defineEmits<{
  select: [path: string];
  clear: [];
}>();

const open = ref(false);
const page = ref<InspectorBindingPickerPage>("collection");
const pendingError = ref("");
const selectingCollection = ref("");
const selectingEntry = ref("");

const propsEditor = usePropsEditor();

const allOptions = computed(() =>
  props.groups.flatMap((group) => group.options),
);

const selectedField = computed(
  () => allOptions.value.find((option) => option.path === props.modelValue) ?? null,
);

const triggerLabel = computed(() => {
  if (props.displayLabel) {
    return props.displayLabel;
  }
  return selectedField.value?.label ?? props.placeholder;
});

const hasSelectedCollection = computed(
  () => Boolean(propsEditor.selectedCollection.value),
);

const hasSelectedEntry = computed(() =>
  Boolean(propsEditor.selectedCmsEntryId.value?.trim()),
);

const visiblePage = computed(() => {
  switch (page.value) {
    case "entry":
      return "2";
    case "field":
      return "3";
    default:
      return "1";
  }
});

function resetPage(): void {
  pendingError.value = "";
  page.value = resolveInspectorBindingPickerInitialPage({
    hasSelectedCollection: hasSelectedCollection.value,
    hasSelectedEntry: hasSelectedEntry.value,
  });
}

watch(open, (isOpen) => {
  if (!isOpen) return;
  resetPage();
});

async function selectCollection(collectionName: string): Promise<void> {
  if (selectingCollection.value) return;
  pendingError.value = "";
  selectingCollection.value = collectionName;
  const result = await propsEditor.updateCmsCollection(collectionName);
  selectingCollection.value = "";
  if (!result.success) {
    pendingError.value = result.error ?? "Could not set CMS collection.";
    return;
  }
  page.value = "entry";
}

async function selectEntry(entry: { id: string; slug?: string }): Promise<void> {
  if (selectingEntry.value) return;
  pendingError.value = "";
  selectingEntry.value = entry.id;
  const result = await propsEditor.updateCmsSingleEntry(entry.id, entry);
  selectingEntry.value = "";
  if (!result.success) {
    pendingError.value = result.error ?? "Could not set preview entry.";
    return;
  }
  page.value = "field";
}

function selectField(field: CmsBindingFieldOption): void {
  emit("select", field.path);
  open.value = false;
}

function selectStatic(): void {
  emit("clear");
  open.value = false;
}

function goBack(): void {
  if (page.value === "field") {
    page.value = hasSelectedEntry.value ? "entry" : "collection";
    return;
  }
  page.value = "collection";
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="outline"
        class="h-8! w-full min-w-0 justify-between rounded-sm border-dashed border-border! bg-input! px-3 text-left text-xs font-normal"
        :disabled="disabled"
        :aria-label="placeholder"
      >
        <span class="flex min-w-0 items-center gap-1.5">
          <span
            v-if="selectedField || active"
            :class="[studioIcons.inspectorTabProps, 'size-3 shrink-0 text-primary']"
          />
          <span class="min-w-0 truncate">{{ triggerLabel }}</span>
        </span>
        <span :class="[studioIcons.chevronDown, 'size-3.5 shrink-0 opacity-60']" />
      </Button>
    </PopoverTrigger>
    <PopoverContent
      align="start"
      side="bottom"
      class="cms-binding-picker w-72 overflow-hidden p-0"
      :side-offset="6"
      @click.stop
    >
      <div class="cms-binding-head">
        <span :class="[studioIcons.inspectorTabProps, 'size-3.5 text-primary']" />
        <span class="min-w-0 flex-1 truncate text-xs font-semibold">
          {{ placeholder }}
        </span>
        <Button
          v-if="page !== 'collection'"
          type="button"
          variant="ghost"
          size="icon-xs"
          class="h-5! w-5!"
          aria-label="Back"
          @click.stop.prevent="goBack"
        >
          <span :class="[studioIcons.chevronLeft, 'size-3']" />
        </Button>
      </div>

      <div class="cms-page-slide" :data-page="visiblePage">
        <section class="cms-page" data-page-id="1">
          <Command>
            <CommandInput placeholder="Search collections..." />
            <CommandList class="max-h-64">
              <CommandEmpty>No collections found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="static-use-manual-content"
                  class="gap-3"
                  @pointerdown.prevent="selectStatic"
                  @click.stop="selectStatic"
                  @select="selectStatic"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm text-foreground">Static</span>
                    <span class="block truncate text-2xs text-muted-foreground">
                      Use manual content instead of a CMS field
                    </span>
                  </span>
                </CommandItem>
                <div
                  v-if="propsEditor.collectionsError.value"
                  class="px-3 py-3 text-xs text-destructive"
                >
                  {{ propsEditor.collectionsError.value }}
                </div>
                <div
                  v-else-if="propsEditor.isLoadingCollections.value"
                  class="px-3 py-3 text-xs text-muted-foreground"
                >
                  Loading collections...
                </div>
                <CommandItem
                  v-for="collection in propsEditor.collections.value"
                  v-else
                  :key="collection.id"
                  :value="`${collection.label} ${collection.name}`"
                  class="gap-3"
                  :disabled="Boolean(selectingCollection)"
                  @pointerdown.prevent="void selectCollection(collection.name)"
                  @click.stop="void selectCollection(collection.name)"
                  @select="void selectCollection(collection.name)"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm text-foreground">
                      {{ collection.label }}
                    </span>
                    <span class="block truncate text-2xs text-muted-foreground">
                      {{ collection.name }}
                    </span>
                  </span>
                  <span
                    v-if="collection.name === propsEditor.selectedCollectionName.value"
                    :class="[studioIcons.check, 'size-3.5 shrink-0 text-primary']"
                  />
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </section>

        <section class="cms-page" data-page-id="2">
          <Command>
            <CommandInput placeholder="Search entries..." />
            <CommandList class="max-h-64">
              <CommandEmpty>No entries found.</CommandEmpty>
              <CommandGroup>
                <div
                  v-if="propsEditor.cmsEntriesError.value"
                  class="px-3 py-3 text-xs text-destructive"
                >
                  {{ propsEditor.cmsEntriesError.value }}
                </div>
                <div
                  v-else-if="propsEditor.isLoadingCmsEntries.value"
                  class="px-3 py-3 text-xs text-muted-foreground"
                >
                  Loading entries...
                </div>
                <CommandItem
                  v-for="entry in propsEditor.cmsEntryOptions.value"
                  v-else
                  :key="entry.id"
                  :value="`${entry.title} ${entry.slug} ${entry.id}`"
                  class="gap-3"
                  :disabled="Boolean(selectingEntry)"
                  @pointerdown.prevent="
                    void selectEntry({ id: entry.id, slug: entry.slug })
                  "
                  @click.stop="void selectEntry({ id: entry.id, slug: entry.slug })"
                  @select="void selectEntry({ id: entry.id, slug: entry.slug })"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm text-foreground">
                      {{ entry.title }}
                    </span>
                    <span class="block truncate text-2xs text-muted-foreground">
                      {{ entry.slug }} · {{ entry.status }}
                    </span>
                  </span>
                  <span
                    v-if="entry.id === propsEditor.selectedCmsEntryId.value"
                    :class="[studioIcons.check, 'size-3.5 shrink-0 text-primary']"
                  />
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </section>

        <section class="cms-page" data-page-id="3">
          <Command>
            <CommandInput placeholder="Search fields..." />
            <CommandList class="max-h-64">
              <CommandEmpty>{{ emptyLabel }}</CommandEmpty>
              <CommandGroup
                v-for="group in groups"
                :key="group.label"
                :heading="group.label"
              >
                <CommandItem
                  v-for="field in group.options"
                  :key="field.path"
                  :value="`${field.label} ${field.path} ${field.type}`"
                  class="gap-3"
                  @pointerdown.prevent="selectField(field)"
                  @click.stop="selectField(field)"
                  @select="selectField(field)"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm text-foreground">
                      {{ field.label }}
                    </span>
                    <span
                      v-if="field.description"
                      class="block truncate text-2xs text-muted-foreground"
                    >
                      {{ field.description }}
                    </span>
                  </span>
                  <span
                    v-if="field.path === modelValue"
                    :class="[studioIcons.check, 'size-3.5 shrink-0 text-primary']"
                  />
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </section>
      </div>

      <div
        v-if="pendingError || propsEditor.cmsSourceError.value"
        class="border-t border-dashed border-border/50 px-3 py-2 text-2xs text-destructive"
      >
        {{ pendingError || propsEditor.cmsSourceError.value }}
      </div>
    </PopoverContent>
  </Popover>
</template>

<style scoped>
.cms-binding-picker {
  border-radius: 8px;
  background: var(--background);
  color: var(--foreground);
  box-shadow: 0 10px 28px rgb(0 0 0 / 0.18);
}

.dark .cms-binding-picker {
  background: var(--sidebar);
}

.cms-binding-head {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.375rem;
  border-bottom: 1px dashed color-mix(in oklch, var(--border) 50%, transparent);
  padding: 0.375rem 0.5rem;
}

.cms-page-slide {
  --page-slide-distance: 8px;
  position: relative;
  height: 16rem;
  overflow: hidden;
}

.cms-page {
  position: absolute;
  inset: 0;
  opacity: 0;
  pointer-events: none;
  transform: translateX(var(--page-slide-distance));
  filter: blur(2px);
  transition:
    opacity 180ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
    filter 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

.cms-page[data-page-id="1"] {
  transform: translateX(calc(var(--page-slide-distance) * -1));
}

.cms-page-slide[data-page="1"] .cms-page[data-page-id="1"],
.cms-page-slide[data-page="2"] .cms-page[data-page-id="2"],
.cms-page-slide[data-page="3"] .cms-page[data-page-id="3"] {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(0);
  filter: blur(0);
}

@media (prefers-reduced-motion: reduce) {
  .cms-page {
    transition: none !important;
  }
}
</style>
