<script setup lang="ts">
import { actions } from "astro:actions";
import type { HTMLAttributes } from "vue";
import { computed, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { studioIcons } from "@/lib/icons";
import {
  ListCollectionsResponseSchema,
  ListEntriesResponseSchema,
} from "../../../../../lib/cms/actionSchemas";
import { EntryListRequestSchema } from "../../../../../lib/cms/schemas";
import type {
  AriaCollection,
  AriaEntryRecord,
  FieldSchema,
} from "../../../../../lib/cms/schemas";
import { cn } from "@/lib/utils";

export interface ContentFieldCmsBinding {
  collectionId: string;
  collectionName: string;
  entryId: string;
  entrySlug?: string;
  fieldPath: string;
  fullPath: string;
  previewValue?: unknown;
}

const props = withDefaults(
  defineProps<{
    modelValue?: ContentFieldCmsBinding | null;
    disabled?: boolean;
    triggerClass?: HTMLAttributes["class"];
  }>(),
  {
    modelValue: null,
    disabled: false,
    triggerClass: undefined,
  },
);

const emit = defineEmits<{
  select: [binding: ContentFieldCmsBinding | null];
}>();

const open = ref(false);
const page = ref<"collection" | "entry" | "field">("collection");
const collections = ref<AriaCollection[]>([]);
const entries = ref<AriaEntryRecord[]>([]);
const selectedCollection = ref<AriaCollection | null>(null);
const selectedEntry = ref<AriaEntryRecord | null>(null);
const isLoadingCollections = ref(false);
const isLoadingEntries = ref(false);
const errorMessage = ref("");

const visiblePage = computed(() => {
  if (page.value === "entry") return "2";
  if (page.value === "field") return "3";
  return "1";
});

const isBound = computed(() => Boolean(props.modelValue?.fullPath));

const fieldOptions = computed(() =>
  selectedCollection.value ? buildCmsFieldOptions(selectedCollection.value) : [],
);

function sourceLocale(record: AriaEntryRecord) {
  return record.locales.find((locale) => locale.isSource) ?? record.locales[0];
}

function entrySlug(record: AriaEntryRecord): string {
  return sourceLocale(record)?.slug ?? "";
}

function entryTitle(record: AriaEntryRecord): string {
  return sourceLocale(record)?.title || entrySlug(record) || record.entry.id;
}

function fieldTypeAllowsBinding(type: string): boolean {
  return [
    "string",
    "text",
    "textarea",
    "url",
    "image",
    "file",
    "number",
    "boolean",
  ].includes(type);
}

function appendFieldOptions(
  fields: readonly FieldSchema[],
  prefix = "",
): { path: string; label: string }[] {
  return fields.flatMap((field) => {
    const path = prefix ? `${prefix}.${field.key}` : field.key;
    const nested = field.fields?.length
      ? appendFieldOptions(field.fields, path)
      : [];
    if (!fieldTypeAllowsBinding(field.type)) {
      return nested;
    }
    return [{ path, label: field.label }, ...nested];
  });
}

function buildCmsFieldOptions(
  collection: AriaCollection,
): { path: string; label: string }[] {
  return [
    { path: "title", label: "Title" },
    { path: "slug", label: "Slug" },
    { path: "body", label: "Body" },
    ...appendFieldOptions(collection.schema.fields),
  ];
}

function valueAtPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, source);
}

function previewValue(record: AriaEntryRecord, fieldPath: string): unknown {
  const locale = sourceLocale(record);
  if (!locale) return "";
  if (fieldPath === "title") return locale.title;
  if (fieldPath === "slug") return locale.slug;
  if (fieldPath === "body") return locale.body ?? "";
  return valueAtPath(locale.frontmatter, fieldPath) ?? "";
}

async function loadCollections(): Promise<void> {
  if (collections.value.length > 0) return;
  isLoadingCollections.value = true;
  errorMessage.value = "";
  try {
    const { data, error } = await actions.cms.collections.list({});
    if (error) {
      errorMessage.value = error.message ?? "Could not load collections.";
      return;
    }
    collections.value = ListCollectionsResponseSchema.parse(data).collections;
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "Could not load collections.";
  } finally {
    isLoadingCollections.value = false;
  }
}

async function selectCollection(collection: AriaCollection): Promise<void> {
  selectedCollection.value = collection;
  selectedEntry.value = null;
  entries.value = [];
  isLoadingEntries.value = true;
  errorMessage.value = "";
  try {
    const payload = EntryListRequestSchema.parse({
      collectionId: collection.id,
      page: 1,
      limit: 100,
      sort: [{ field: "updatedAt", direction: "desc" }],
    });
    const { data, error } = await actions.cms.entries.list(payload);
    if (error) {
      errorMessage.value = error.message ?? "Could not load entries.";
      return;
    }
    entries.value = ListEntriesResponseSchema.parse(data).items;
    page.value = "entry";
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "Could not load entries.";
  } finally {
    isLoadingEntries.value = false;
  }
}

function selectEntry(record: AriaEntryRecord): void {
  selectedEntry.value = record;
  page.value = "field";
}

function selectField(fieldPath: string): void {
  const collection = selectedCollection.value;
  const entry = selectedEntry.value;
  if (!collection || !entry) return;
  emit("select", {
    collectionId: collection.id,
    collectionName: collection.name,
    entryId: entry.entry.id,
    ...(entrySlug(entry) ? { entrySlug: entrySlug(entry) } : {}),
    fieldPath,
    fullPath: `${collection.name}.${fieldPath}`,
    previewValue: previewValue(entry, fieldPath),
  });
  open.value = false;
}

function clearBinding(): void {
  emit("select", null);
  open.value = false;
}

watch(open, (isOpen) => {
  if (!isOpen) return;
  page.value = "collection";
  void loadCollections();
});
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="headerAction"
        size="icon-xs"
        title="Bind CMS field"
        :disabled="disabled"
        :class="
          cn(
            'size-6 rounded-md text-muted-foreground hover:text-foreground',
            isBound && 'text-primary hover:text-primary',
            disabled && 'pointer-events-none opacity-50',
            triggerClass,
          )
        "
      >
        <span :class="[studioIcons.props, 'size-4 shrink-0']" />
      </Button>
    </PopoverTrigger>

    <PopoverContent
      align="end"
      side="bottom"
      class="cms-field-picker w-72 overflow-hidden p-0"
      :side-offset="8"
      @click.stop
    >
      <div class="cms-field-head">
        <span :class="[studioIcons.props, 'size-3.5 text-primary']" />
        <span class="min-w-0 flex-1 truncate">Bind CMS field</span>
        <Button
          v-if="page !== 'collection'"
          type="button"
          variant="ghost"
          size="icon-xs"
          class="h-5! w-5!"
          aria-label="Back"
          @click.stop.prevent="page = page === 'field' ? 'entry' : 'collection'"
        >
          <span :class="[studioIcons.chevronLeft, 'size-3']" />
        </Button>
      </div>

      <div class="cms-page-slide" :data-page="visiblePage">
        <section class="cms-page" data-page-id="1">
          <Command>
            <CommandList class="max-h-64">
              <CommandEmpty>No collections found.</CommandEmpty>
              <CommandGroup>
                <div
                  v-if="isLoadingCollections"
                  class="px-3 py-3 text-xs text-muted-foreground"
                >
                  Loading collections...
                </div>
                <CommandItem
                  v-for="collection in collections"
                  v-else
                  :key="collection.id"
                  :value="`${collection.label} ${collection.name}`"
                  class="gap-2"
                  @select="void selectCollection(collection)"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-xs text-foreground">
                      {{ collection.label }}
                    </span>
                    <span class="block truncate text-2xs text-muted-foreground">
                      {{ collection.name }}
                    </span>
                  </span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </section>

        <section class="cms-page" data-page-id="2">
          <Command>
            <CommandList class="max-h-64">
              <CommandEmpty>No entries found.</CommandEmpty>
              <CommandGroup>
                <div
                  v-if="isLoadingEntries"
                  class="px-3 py-3 text-xs text-muted-foreground"
                >
                  Loading entries...
                </div>
                <CommandItem
                  v-for="entry in entries"
                  v-else
                  :key="entry.entry.id"
                  :value="`${entryTitle(entry)} ${entrySlug(entry)} ${entry.entry.id}`"
                  class="gap-2"
                  @select="selectEntry(entry)"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-xs text-foreground">
                      {{ entryTitle(entry) }}
                    </span>
                    <span class="block truncate text-2xs text-muted-foreground">
                      {{ entrySlug(entry) || entry.entry.id }}
                    </span>
                  </span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </section>

        <section class="cms-page" data-page-id="3">
          <Command>
            <CommandList class="max-h-64">
              <CommandEmpty>No fields found.</CommandEmpty>
              <CommandGroup>
                <CommandItem value="Static" class="gap-2" @select="clearBinding">
                  <span class="min-w-0 flex-1 truncate text-xs text-foreground">
                    Static
                  </span>
                </CommandItem>
                <CommandItem
                  v-for="field in fieldOptions"
                  :key="field.path"
                  :value="`${field.label} ${field.path}`"
                  class="gap-2"
                  @select="selectField(field.path)"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-xs text-foreground">
                      {{ field.label }}
                    </span>
                    <span class="block truncate text-2xs text-muted-foreground">
                      {{ field.path }}
                    </span>
                  </span>
                  <span
                    v-if="modelValue?.fieldPath === field.path"
                    :class="[studioIcons.check, 'size-3.5 text-primary']"
                  />
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </section>
      </div>

      <div
        v-if="errorMessage"
        class="border-t border-dashed border-border/50 px-3 py-2 text-2xs text-destructive"
      >
        {{ errorMessage }}
      </div>
    </PopoverContent>
  </Popover>
</template>

<style scoped>
.cms-field-picker {
  border-radius: 8px;
  border-style: solid;
  background: var(--background);
  color: var(--foreground);
  box-shadow: 0 10px 28px rgb(0 0 0 / 0.18);
}

.dark .cms-field-picker {
  background: var(--sidebar);
}

.cms-field-head {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.375rem;
  border-bottom: 1px dashed color-mix(in oklch, var(--border) 50%, transparent);
  padding: 0.375rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
}

.cms-page-slide {
  --page-slide-distance: 8px;
  position: relative;
  height: 17rem;
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
