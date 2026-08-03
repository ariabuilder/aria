<script setup lang="ts">
import { computed, ref, useAttrs, watch } from "vue";
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
  resolveCmsQuickPickerInitialPage,
  useSelectionToolbarCms,
  type CmsQuickBindingSelection,
  type CmsQuickBindingTarget,
  type CmsQuickTargetKind,
} from "../composables/useSelectionToolbarCms";
import { useStudioI18n } from "@/i18n";

const props = defineProps<{
  mode: "loop" | "field";
  kind?: CmsQuickTargetKind;
  icon: string;
  label: string;
  active?: boolean;
}>();

defineOptions({
  inheritAttrs: false,
});

const attrs = useAttrs();
const open = ref(false);
const page = ref<"collection" | "entry" | "mapping">("collection");
const selectedPaths = ref<Record<string, string>>({});
const pendingError = ref("");
const isApplying = ref(false);
const selectingCollection = ref("");
const selectingEntry = ref("");

const toolbarCms = useSelectionToolbarCms();
const { t } = useStudioI18n();

const requiresEntryStep = computed(
  () => props.mode === "field" && !toolbarCms.selectedCmsEntryId.value,
);

const hasSelectedCollection = computed(
  () => Boolean(toolbarCms.selectedCollection.value),
);

const targets = computed(() =>
  toolbarCms.quickBindingTargets({
    mode: props.mode,
    kind: props.kind,
  }),
);

const visiblePage = computed(() => {
  switch (page.value) {
    case "entry":
      return "2";
    case "mapping":
      return "3";
    default:
      return "1";
  }
});

const canApply = computed(() =>
  targets.value.some((target) => Boolean(selectedPaths.value[target.id]?.trim())),
);

function resetSelections(nextTargets: readonly CmsQuickBindingTarget[]): void {
  selectedPaths.value = Object.fromEntries(
    nextTargets.map((target) => [
      target.id,
      target.currentPath || target.suggestedPath,
    ]),
  );
}

function resetPage(): void {
  pendingError.value = "";
  page.value = resolveCmsQuickPickerInitialPage({
    mode: props.mode,
    hasSelectedCollection: hasSelectedCollection.value,
    requiresEntryStep: requiresEntryStep.value,
    isEntryTemplatePage: toolbarCms.isEntryTemplatePage.value,
  });
}

watch(open, (isOpen) => {
  if (!isOpen) return;
  resetPage();
  resetSelections(targets.value);
});

watch(targets, (nextTargets) => {
  if (!open.value) return;
  resetSelections(nextTargets);
});

function setTargetPath(targetId: string, path: string): void {
  selectedPaths.value = {
    ...selectedPaths.value,
    [targetId]: path,
  };
}

async function selectCollection(collectionName: string): Promise<void> {
  if (selectingCollection.value) return;
  pendingError.value = "";
  selectingCollection.value = collectionName;
  const result =
    props.mode === "loop"
      ? await toolbarCms.updateQuickLoopCollection(collectionName)
      : await toolbarCms.updateQuickCollection(collectionName);
  selectingCollection.value = "";
  if (!result.success) {
    pendingError.value = result.error ?? t("composer.toolbar.cms.setCollectionError");
    return;
  }
  page.value = props.mode === "loop" ? "mapping" : "entry";
}

async function selectEntry(entry: { id: string; slug?: string }): Promise<void> {
  if (selectingEntry.value) return;
  pendingError.value = "";
  selectingEntry.value = entry.id;
  const result = await toolbarCms.updateQuickSingleEntry(entry.id, entry);
  selectingEntry.value = "";
  if (!result.success) {
    pendingError.value = result.error ?? t("composer.toolbar.cms.setEntryError");
    return;
  }
  page.value = "mapping";
}

async function selectStatic(): Promise<void> {
  if (props.mode !== "field" || !props.kind) {
    open.value = false;
    return;
  }

  pendingError.value = "";
  isApplying.value = true;
  const result = await toolbarCms.clearQuickFieldBinding(props.kind);
  isApplying.value = false;
  if (!result.success) {
    pendingError.value = result.error ?? t("composer.toolbar.cms.clearBindingError");
    return;
  }
  open.value = false;
}

async function applyMappings(): Promise<void> {
  pendingError.value = "";
  const selections: CmsQuickBindingSelection[] = targets.value
    .map((target) => ({
      nodeId: target.nodeId,
      propName: target.propName,
      fieldPath: selectedPaths.value[target.id] ?? "",
      inherited:
        props.mode === "loop" || toolbarCms.hasInheritedCmsLoopSource.value,
    }))
    .filter((selection) => selection.fieldPath.trim().length > 0);

  if (selections.length === 0) {
    open.value = false;
    return;
  }

  isApplying.value = true;
  const result = await toolbarCms.applyQuickBindings(selections);
  isApplying.value = false;
  if (!result.success) {
    pendingError.value = result.error ?? t("composer.toolbar.cms.applyBindingsError");
    return;
  }
  open.value = false;
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        v-bind="attrs"
        type="button"
        variant="ghost"
        size="icon-sm"
        class="shrink-0 h-6!"
        :class="{ '!text-primary': active || open }"
        :title="label"
        :aria-label="label"
        :aria-pressed="active || open"
      >
        <span :class="[icon, 'size-4', active || open ? '!text-primary' : '']" />
      </Button>
    </PopoverTrigger>
    <PopoverContent
      align="start"
      side="bottom"
      class="cms-quick-picker w-72 overflow-hidden p-0"
      :side-offset="3"
      @click.stop
    >
      <div class="cms-quick-head">
        <span :class="[icon, 'size-3.5 text-primary']" />
        <span class="min-w-0 flex-1 truncate">{{ label }}</span>
        <Button
          v-if="page !== 'collection'"
          type="button"
          variant="ghost"
          size="icon-sm"
          class="h-6! w-6!"
          :aria-label="t('common.back')"
          @click.stop.prevent="
            page = page === 'mapping' && requiresEntryStep ? 'entry' : 'collection'
          "
        >
          <span :class="[studioIcons.chevronLeft, 'size-3']" />
        </Button>
      </div>

      <div class="cms-page-slide" :data-page="visiblePage">
        <section class="cms-page" data-page-id="1">
          <Command>
            <CommandList class="max-h-64">
              <CommandEmpty>{{ t("composer.toolbar.cms.noCollections") }}</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  v-if="mode === 'field'"
                  :value="t('composer.toolbar.cms.staticNoBinding')"
                  class="gap-2"
                  :disabled="isApplying"
                  @select="void selectStatic()"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-xs text-foreground">
                      {{ t("inspector.repeat.static") }}
                    </span>
                    <span class="block truncate text-2xs text-muted-foreground">
                      {{ t("composer.toolbar.cms.noBinding") }}
                    </span>
                  </span>
                  <span
                    v-if="!active"
                    :class="[studioIcons.check, 'size-3.5 text-primary']"
                  />
                </CommandItem>
                <div
                  v-if="toolbarCms.collectionsError.value"
                  class="px-3 py-3 text-xs text-destructive"
                >
                  {{ toolbarCms.collectionsError.value }}
                </div>
                <div
                  v-else-if="toolbarCms.isLoadingCollections.value"
                  class="px-3 py-3 text-xs text-muted-foreground"
                >
                  {{ t("composer.toolbar.cms.loadingCollections") }}
                </div>
                <CommandItem
                  v-for="collection in toolbarCms.collections.value"
                  v-else
                  :key="collection.id"
                  :value="`${collection.label} ${collection.name}`"
                  class="gap-2"
                  :disabled="Boolean(selectingCollection)"
                  @select="void selectCollection(collection.name)"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-xs text-foreground">
                      {{ collection.label }}
                    </span>
                    <span class="block truncate text-2xs text-muted-foreground">
                      {{ collection.name }}
                    </span>
                  </span>
                  <span
                    v-if="
                      (mode === 'loop' || active) &&
                      collection.name === toolbarCms.selectedCollectionName.value
                    "
                    :class="[studioIcons.check, 'size-3.5 text-primary']"
                  />
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </section>

        <section class="cms-page" data-page-id="2">
          <Command>
            <CommandList class="max-h-64">
              <CommandEmpty>{{ t("composer.toolbar.cms.noEntries") }}</CommandEmpty>
              <CommandGroup>
                <div
                  v-if="toolbarCms.cmsEntriesError.value"
                  class="px-3 py-3 text-xs text-destructive"
                >
                  {{ toolbarCms.cmsEntriesError.value }}
                </div>
                <div
                  v-else-if="toolbarCms.isLoadingCmsEntries.value"
                  class="px-3 py-3 text-xs text-muted-foreground"
                >
                  {{ t("composer.toolbar.cms.loadingEntries") }}
                </div>
                <CommandItem
                  v-for="entry in toolbarCms.cmsEntryOptions.value"
                  v-else
                  :key="entry.id"
                  :value="`${entry.title} ${entry.slug} ${entry.id}`"
                  class="gap-2"
                  :disabled="Boolean(selectingEntry)"
                  @select="void selectEntry({ id: entry.id, slug: entry.slug })"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-xs text-foreground">
                      {{ entry.title }}
                    </span>
                    <span class="block truncate text-2xs text-muted-foreground">
                      {{ entry.slug }} · {{ entry.status }}
                    </span>
                  </span>
                  <span
                    v-if="entry.id === toolbarCms.selectedCmsEntryId.value"
                    :class="[studioIcons.check, 'size-3.5 text-primary']"
                  />
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </section>

        <section class="cms-page" data-page-id="3">
          <div class="grid max-h-64 gap-1 overflow-y-auto p-1.5">
            <div
              v-if="targets.length === 0"
              class="px-2 py-5 text-center text-xs text-muted-foreground"
            >
              {{ t("composer.toolbar.cms.noBindableFields") }}
            </div>
            <div
              v-for="target in targets"
              :key="target.id"
              class="cms-map-row"
            >
              <div class="min-w-0">
                <div class="truncate text-xs text-foreground">
                  {{ target.nodeLabel }}
                </div>
                <div class="truncate text-2xs text-muted-foreground">
                  {{ target.kind }} · {{ target.propName }}
                </div>
              </div>
              <select
                class="cms-map-select"
                :value="selectedPaths[target.id] ?? ''"
                @change="
                  setTargetPath(
                    target.id,
                    ($event.target as HTMLSelectElement).value,
                  )
                "
              >
                <option value="">{{ t("inspector.repeat.static") }}</option>
                <optgroup
                  v-for="group in target.groups"
                  :key="`${target.id}:${group.label}`"
                  :label="group.label"
                >
                  <option
                    v-for="field in group.options"
                    :key="`${target.id}:${field.path}`"
                    :value="field.path"
                  >
                    {{ field.label }}
                  </option>
                </optgroup>
              </select>
            </div>
          </div>
          <div class="cms-quick-foot">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              class="h-7! px-2!"
              @click.stop.prevent="open = false"
            >
              {{ t("common.cancel") }}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="xs"
              class="h-7! px-2!"
              :disabled="isApplying || !canApply"
              @click.stop.prevent="void applyMappings()"
            >
              {{ t("common.apply") }}
            </Button>
          </div>
        </section>
      </div>

      <div
        v-if="pendingError || toolbarCms.cmsSourceError.value"
        class="border-t border-dashed border-border/50 px-3 py-2 text-2xs text-destructive"
      >
        {{ pendingError || toolbarCms.cmsSourceError.value }}
      </div>
    </PopoverContent>
  </Popover>
</template>

<style scoped>
.cms-quick-picker {
  border-radius: 8px;
  border-style: solid;
  background: var(--background);
  color: var(--foreground);
  box-shadow: 0 10px 28px rgb(0 0 0 / 0.18);
  transform-origin: top left;
  animation: cms-quick-open 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

.dark .cms-quick-picker {
  background: var(--sidebar);
}

.cms-quick-head,
.cms-quick-foot {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.375rem;
  border-bottom: 1px dashed color-mix(in oklch, var(--border) 50%, transparent);
  padding: 0.375rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
}

.cms-quick-foot {
  justify-content: flex-end;
  border-top: 1px dashed color-mix(in oklch, var(--border) 50%, transparent);
  border-bottom: 0;
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

.cms-map-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(7rem, 8.75rem);
  gap: 0.5rem;
  align-items: center;
  border: 1px dashed color-mix(in oklch, var(--border) 50%, transparent);
  border-radius: 6px;
  padding: 0.375rem 0.5rem;
}

.cms-map-select {
  min-width: 0;
  height: 1.75rem;
  border-radius: 5px;
  border: 1px solid color-mix(in oklch, var(--border) 65%, transparent);
  background: transparent;
  padding: 0 1.5rem 0 0.5rem;
  color: var(--foreground);
  font-size: 0.6875rem;
  outline: none;
}

.cms-map-select:focus {
  border-color: color-mix(in oklch, var(--primary) 80%, transparent);
}

@keyframes cms-quick-open {
  from {
    width: 2.5rem;
    max-height: 2.5rem;
    opacity: 0.8;
    border-radius: 999px;
    transform: scale(0.98);
  }
  to {
    width: 18rem;
    max-height: 24rem;
    opacity: 1;
    border-radius: 8px;
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .cms-quick-picker,
  .cms-page {
    animation: none !important;
    transition: none !important;
  }
}
</style>
