<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogScrollContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useStudioI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { studioIcons } from "@/lib/icons";
import { useDesignImporter } from "../composables/useDesignImporter";
import {
  parseDesignImportInput,
  type DesignImportCollisionContext,
  type DesignImportMode,
  type DesignImportParseResult,
  type DesignImportPlan,
  type DesignImportSection,
  type DesignImportSectionId,
} from "../lib/designImporter";

const SECTION_ICONS: Record<DesignImportSectionId, string> = {
  colors: studioIcons.colorPalette,
  variables: studioIcons.code,
  globalStyles: studioIcons.designLayout,
  typography: studioIcons.textFontSize,
  classes: studioIcons.codeSquare,
  contextRules: studioIcons.designLayout,
  animations: studioIcons.motion,
};

const MERGEABLE_SECTIONS = new Set<DesignImportSectionId>([
  "variables",
  "classes",
  "contextRules",
  "animations",
]);

const props = withDefaults(
  defineProps<{
    open: boolean;
    title?: string;
    description?: string;
    allowedSections?: DesignImportSectionId[];
    collisionContext?: DesignImportCollisionContext;
  }>(),
  {
    title: undefined,
    description: undefined,
    allowedSections: undefined,
    collisionContext: undefined,
  },
);

const emit = defineEmits<{
  "update:open": [value: boolean];
  imported: [];
}>();

const { t } = useStudioI18n();
const { isImporting, applyDesignImport } = useDesignImporter();

const activeInputMode = ref<"paste" | "upload">("paste");
const importText = ref("");
const debouncedImportText = ref("");
const uploadedFileName = ref<string | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const selectedSectionIds = ref<DesignImportSectionId[]>([]);
const sectionModes = ref<Partial<Record<DesignImportSectionId, DesignImportMode>>>(
  {},
);
const showSkippedRules = ref(false);

let parseDebounceTimer: ReturnType<typeof setTimeout> | null = null;

const dialogTitle = computed(() => props.title ?? t("design.import.title"));
const dialogDescription = computed(
  () => props.description ?? t("design.import.description"),
);

function sectionLabel(sectionId: DesignImportSectionId): string {
  switch (sectionId) {
    case "colors":
      return t("design.import.section.colors");
    case "variables":
      return t("design.import.section.variables");
    case "globalStyles":
      return t("design.import.section.globalStyles");
    case "typography":
      return t("design.import.section.typography");
    case "classes":
      return t("design.import.section.classes");
    case "contextRules":
      return t("design.import.section.contextRules");
    case "animations":
      return t("design.import.section.animations");
  }
}

function sectionDescription(sectionId: DesignImportSectionId): string {
  switch (sectionId) {
    case "colors":
      return t("design.import.section.colorsDescription");
    case "variables":
      return t("design.import.section.variablesDescription");
    case "globalStyles":
      return t("design.import.section.globalStylesDescription");
    case "typography":
      return t("design.import.section.typographyDescription");
    case "classes":
      return t("design.import.section.classesDescription");
    case "contextRules":
      return t("design.import.section.contextRulesDescription");
    case "animations":
      return t("design.import.section.animationsDescription");
  }
}

function formatCollisionLabel(count: number): string {
  return t(
    count === 1
      ? "design.import.overwrite"
      : "design.import.overwritePlural",
    { count },
  );
}

function formatSkippedRulesLabel(count: number): string {
  return t(
    count === 1
      ? "design.import.skippedRule"
      : "design.import.skippedRules",
    { count },
  );
}

watch(
  importText,
  (value) => {
    if (parseDebounceTimer) {
      clearTimeout(parseDebounceTimer);
    }

    parseDebounceTimer = setTimeout(() => {
      debouncedImportText.value = value;
    }, 150);
  },
  { immediate: true },
);

const allowedSectionSet = computed(() =>
  props.allowedSections && props.allowedSections.length > 0
    ? new Set(props.allowedSections)
    : null,
);

const parseResult = computed<DesignImportParseResult>(() =>
  parseDesignImportInput(debouncedImportText.value, {
    collisionContext: props.collisionContext,
  }),
);

const importPlan = computed<DesignImportPlan | null>(() =>
  parseResult.value.success ? parseResult.value : null,
);

const visibleSections = computed<DesignImportSection[]>(() => {
  const plan = importPlan.value;
  if (!plan) {
    return [];
  }

  const allowed = allowedSectionSet.value;
  return allowed
    ? plan.sections.filter((section) => allowed.has(section.id))
    : plan.sections;
});

const selectedSections = computed(() =>
  visibleSections.value.filter((section) =>
    selectedSectionIds.value.includes(section.id),
  ),
);

const allVisibleSelected = computed(
  () =>
    visibleSections.value.length > 0 &&
    visibleSections.value.every((section) =>
      selectedSectionIds.value.includes(section.id),
    ),
);

const blockingErrors = computed(() =>
  debouncedImportText.value.trim() && !parseResult.value.success
    ? parseResult.value.errors
    : [],
);

const planWarnings = computed(() => importPlan.value?.warnings ?? []);

const skippedRuleWarnings = computed(() =>
  planWarnings.value.filter((warning) =>
    warning.message.startsWith("Skipped "),
  ),
);

const nonSkippedWarnings = computed(() =>
  planWarnings.value.filter(
    (warning) => !warning.message.startsWith("Skipped "),
  ),
);

const detectionSummary = computed(() => {
  const plan = importPlan.value;
  if (!plan) {
    return null;
  }

  const parts: string[] = [];
  for (const section of visibleSections.value) {
    const label = sectionLabel(section.id).toLowerCase();
    parts.push(`${section.count} ${label}`);
  }

  const skippedCount = skippedRuleWarnings.value.length;
  if (skippedCount > 0) {
    parts.push(t("design.import.skippedCount", { count: skippedCount }));
  }

  return parts.join(" · ");
});

const canImport = computed(
  () =>
    Boolean(importPlan.value) &&
    selectedSections.value.length > 0 &&
    !isImporting.value,
);

function resetState(): void {
  activeInputMode.value = "paste";
  importText.value = "";
  debouncedImportText.value = "";
  uploadedFileName.value = null;
  selectedSectionIds.value = [];
  sectionModes.value = {};
  showSkippedRules.value = false;
}

function handleOpenChange(value: boolean): void {
  emit("update:open", value);
  if (!value) {
    resetState();
  }
}

function getSectionMode(section: DesignImportSection): DesignImportMode {
  return sectionModes.value[section.id] ?? section.defaultMode;
}

function setSectionMode(section: DesignImportSection, value: string): void {
  if (value !== "merge" && value !== "replace") {
    return;
  }

  sectionModes.value = {
    ...sectionModes.value,
    [section.id]: value,
  };
}

function isSectionSelected(sectionId: DesignImportSectionId): boolean {
  return selectedSectionIds.value.includes(sectionId);
}

function setSectionSelected(
  sectionId: DesignImportSectionId,
  selected: boolean | "indeterminate",
): void {
  if (selected === "indeterminate") {
    return;
  }

  selectedSectionIds.value = selected
    ? Array.from(new Set([...selectedSectionIds.value, sectionId]))
    : selectedSectionIds.value.filter((id) => id !== sectionId);
}

function toggleSection(sectionId: DesignImportSectionId): void {
  setSectionSelected(sectionId, !isSectionSelected(sectionId));
}

function toggleAllSections(): void {
  selectedSectionIds.value = allVisibleSelected.value
    ? []
    : visibleSections.value.map((section) => section.id);
}

function triggerFilePicker(): void {
  fileInputRef.value?.click();
}

async function readFile(file: File): Promise<void> {
  uploadedFileName.value = file.name;
  importText.value = await file.text();
}

function handleFileSelect(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    return;
  }

  void readFile(file);
}

function handleFileDrop(event: DragEvent): void {
  event.preventDefault();
  const file = event.dataTransfer?.files?.[0];
  if (!file) {
    return;
  }

  void readFile(file);
}

async function handleImport(): Promise<void> {
  const plan = importPlan.value;
  if (!plan || selectedSections.value.length === 0) {
    return;
  }

  const imported = await applyDesignImport(plan, {
    selectedSections: selectedSections.value.map((section) => section.id),
    modes: sectionModes.value,
  });

  if (imported) {
    emit("imported");
    handleOpenChange(false);
  }
}

watch(
  visibleSections,
  (sections) => {
    selectedSectionIds.value = sections.map((section) => section.id);
    sectionModes.value = Object.fromEntries(
      sections.map((section) => [section.id, section.defaultMode]),
    ) as Partial<Record<DesignImportSectionId, DesignImportMode>>;
  },
  { immediate: true },
);
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogScrollContent
      lock-overlay-scroll
      class="t-importer-modal h-[70dvh] min-h-0 w-[56rem]! max-w-[calc(100vw-2rem)]! grid-rows-[auto_auto_minmax(0,1fr)_auto_auto] gap-0 overflow-hidden p-0 md:w-[56rem]!"
    >
      <DialogHeader class="flex shrink-0 flex-col gap-2 px-7 pt-7">
        <DialogTitle class="m-0 text-base font-medium leading-none">
          {{ dialogTitle }}
        </DialogTitle>
        <DialogDescription class="m-0 text-xs text-muted-foreground">
          {{ dialogDescription }}
        </DialogDescription>
      </DialogHeader>

      <Separator />

      <div class="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_18rem] gap-0 overflow-hidden">
        <section class="flex min-h-0 flex-col gap-3 p-4">
          <div
            class="t-importer-tabs"
            role="tablist"
            :aria-label="t('design.import.source')"
          >
            <span
              class="t-importer-tabs-pill"
              :style="{
                transform:
                  activeInputMode === 'paste'
                    ? 'translateX(0)'
                    : 'translateX(calc(100% + 0.1875rem))',
              }"
              aria-hidden="true"
            />
            <button
              type="button"
              class="t-importer-tab"
              :aria-selected="activeInputMode === 'paste'"
              @click="activeInputMode = 'paste'"
            >
              {{ t("design.import.paste") }}
            </button>
            <button
              type="button"
              class="t-importer-tab"
              :aria-selected="activeInputMode === 'upload'"
              @click="activeInputMode = 'upload'"
            >
              {{ t("design.import.upload") }}
            </button>
          </div>

          <div class="min-h-0 flex-1">
            <Textarea
              v-if="activeInputMode === 'paste'"
              v-model="importText"
              class="h-full min-h-0 resize-none font-mono text-x text-balance"
              :placeholder="t('design.import.pastePlaceholder')"
            />

            <button
              v-else
              type="button"
              class="flex h-full w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/20 px-6 text-center text-sm transition-[background-color,border-color,color] duration-150 hover:border-border/80 hover:bg-muted/30"
              @click="triggerFilePicker"
              @dragover.prevent
              @drop="handleFileDrop"
            >
              <span
                :class="[studioIcons.upload, 'size-6 text-muted-foreground']"
                aria-hidden="true"
              />
              <span class="font-medium text-foreground">
                {{ uploadedFileName ?? t("design.import.dropOrBrowse") }}
              </span>
              <span class="text-xs text-muted-foreground">
                {{ t("design.import.fileTypes") }}
              </span>
            </button>
          </div>

          <input
            ref="fileInputRef"
            type="file"
            accept=".json,.css,.txt,.aria-design.json"
            class="hidden"
            @change="handleFileSelect"
          />
        </section>

        <section class="min-h-0 border-l border-border">
          <Command class="h-full rounded-none border-0 bg-transparent shadow-none">
            <div class="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
              <CommandInput
                :placeholder="t('design.import.filterGroups')"
                wrapper-class="min-w-0 flex-1 px-0 py-0"
                class="h-8 text-xs"
              />
              <Button
                v-if="visibleSections.length > 0"
                variant="ghost"
                size="sm"
                class="h-8 shrink-0"
                @click="toggleAllSections"
              >
                {{
                  allVisibleSelected
                    ? t("design.import.clear")
                    : t("design.import.selectAll")
                }}
              </Button>
            </div>

            <ScrollArea class="min-h-0 flex-1">
              <CommandList class="max-h-none">
                <CommandGroup :heading="t('design.import.detected')">
                  <CommandItem
                    v-for="section in visibleSections"
                    :key="section.id"
                    :value="section.id"
                    class="items-start gap-3 px-4 py-2.5"
                    @select.prevent="toggleSection(section.id)"
                  >
                    <Checkbox
                      :model-value="isSectionSelected(section.id)"
                      class="mt-0.5"
                      @update:model-value="setSectionSelected(section.id, $event)"
                    />
                    <div class="flex min-w-0 flex-1 flex-col gap-2">
                      <div class="flex min-w-0 items-start justify-between gap-3">
                        <div class="flex min-w-0 items-center gap-2">
                          <span
                            :class="[SECTION_ICONS[section.id], 'size-3.5 shrink-0']"
                            aria-hidden="true"
                          />
                          <span class="truncate font-medium text-foreground">
                            {{ sectionLabel(section.id) }}
                          </span>
                        </div>
                        <Badge variant="outline" size="xs">
                          {{ section.count }}
                        </Badge>
                        <Badge
                          v-if="section.collisions.length > 0"
                          variant="secondary"
                          size="xs"
                        >
                          {{ formatCollisionLabel(section.collisions.length) }}
                        </Badge>
                      </div>
                      <p class="m-0 text-xs leading-relaxed text-muted-foreground">
                        {{ sectionDescription(section.id) }}
                      </p>
                      <Select
                        v-if="MERGEABLE_SECTIONS.has(section.id)"
                        :model-value="getSectionMode(section)"
                        @update:model-value="setSectionMode(section, String($event))"
                      >
                        <SelectTrigger class="h-8 w-32 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="merge">
                            {{ t("design.import.merge") }}
                          </SelectItem>
                          <SelectItem value="replace">
                            {{ t("design.import.replace") }}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CommandItem>

                  <div
                    v-if="importPlan && visibleSections.length === 0"
                    class="flex flex-col gap-1 px-6 py-7 text-center"
                  >
                    <p class="m-0 text-sm font-medium text-foreground">
                      {{ t("design.import.noMatchingGroups") }}
                    </p>
                    <p class="m-0 text-xs text-muted-foreground">
                      {{ t("design.import.filteredScope") }}
                    </p>
                  </div>

                  <div
                    v-if="!importPlan"
                    class="flex flex-col gap-1 px-6 py-7 text-center"
                  >
                    <p class="m-0 text-sm font-medium text-foreground">
                      {{ t("design.import.waitingTitle") }}
                    </p>
                    <p class="m-0 text-xs text-muted-foreground">
                      {{ t("design.import.waitingDescription") }}
                    </p>
                  </div>
                </CommandGroup>
              </CommandList>
            </ScrollArea>
          </Command>
        </section>
      </div>

      <Separator />

      <div class="flex shrink-0 flex-col gap-3 px-4 py-3">
        <Alert
          v-if="blockingErrors.length > 0"
          variant="destructive"
          class="t-importer-error"
        >
          <span :class="[studioIcons.warning, 'size-4']" aria-hidden="true" />
          <AlertTitle>{{ t("design.import.parseFailed") }}</AlertTitle>
          <AlertDescription>
            {{ blockingErrors[0]?.message }}
          </AlertDescription>
        </Alert>

        <Alert v-else-if="nonSkippedWarnings.length > 0" class="bg-card">
          <span :class="[studioIcons.warning, 'size-4']" aria-hidden="true" />
          <AlertTitle>{{ t("design.import.reviewWarnings") }}</AlertTitle>
          <AlertDescription>
            {{ nonSkippedWarnings[0]?.message }}
          </AlertDescription>
        </Alert>

        <div
          v-if="skippedRuleWarnings.length > 0"
          class="rounded-md border border-border bg-card px-3 py-2"
        >
          <button
            type="button"
            class="flex w-full items-center justify-between gap-2 text-left text-xs font-medium text-foreground"
            @click="showSkippedRules = !showSkippedRules"
          >
            <span>{{ formatSkippedRulesLabel(skippedRuleWarnings.length) }}</span>
            <span class="text-muted-foreground">
              {{
                showSkippedRules
                  ? t("design.import.hide")
                  : t("design.import.show")
              }}
            </span>
          </button>
          <ul
            v-if="showSkippedRules"
            class="mt-2 max-h-28 space-y-1 overflow-y-auto text-xs text-muted-foreground"
          >
            <li v-for="(warning, index) in skippedRuleWarnings" :key="index">
              {{ warning.message }}
            </li>
          </ul>
        </div>

        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0 text-xs text-muted-foreground">
            <template v-if="importPlan">
              <template v-if="detectionSummary">
                {{ t("design.import.detectedSummary", { summary: detectionSummary }) }}
                <span class="mx-1">·</span>
              </template>
              {{
                t("design.import.selectedSummary", {
                  selected: selectedSections.length,
                  total: visibleSections.length,
                })
              }}
              <span v-if="importPlan.format !== 'unknown'">
                · {{ importPlan.format }}
              </span>
            </template>
            <template v-else>
              {{ t("design.import.emptyFooter") }}
            </template>
          </div>

          <div class="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="sm" @click="handleOpenChange(false)">
              {{ t("common.cancel") }}
            </Button>
            <Button
              size="sm"
              :disabled="!canImport"
              @click="handleImport"
            >
              <span
                v-if="isImporting"
                :class="[studioIcons.loading, 'size-3.5 animate-spin']"
                aria-hidden="true"
              />
              {{
                isImporting
                  ? t("design.import.importing")
                  : t("design.import.importSelected")
              }}
            </Button>
          </div>
        </div>
      </div>
    </DialogScrollContent>
  </Dialog>
</template>

<style scoped>
.t-importer-modal {
  --importer-open-dur: 250ms;
  --importer-close-dur: 150ms;
  --importer-scale: 0.96;
  --importer-ease: cubic-bezier(0.22, 1, 0.36, 1);
  transform-origin: center;
  animation: importer-modal-in var(--importer-open-dur) var(--importer-ease);
}

.t-importer-tabs {
  --tabs-dur: 250ms;
  --tabs-ease: cubic-bezier(0.22, 1, 0.36, 1);
  position: relative;
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 0.1875rem;
  border-radius: 999px;
  background: var(--muted);
  padding: 0.1875rem;
}

.t-importer-tab {
  position: relative;
  z-index: 1;
  height: 1.875rem;
  min-width: 4.5rem;
  border-radius: 999px;
  color: var(--muted-foreground);
  font-size: 0.75rem;
  line-height: 1;
  transition: color var(--tabs-dur) var(--tabs-ease);
}

.t-importer-tab[aria-selected="true"],
.t-importer-tab:hover {
  color: var(--foreground);
}

.t-importer-tabs-pill {
  position: absolute;
  inset-block-start: 0.1875rem;
  inset-inline-start: 0.1875rem;
  z-index: 0;
  height: 1.875rem;
  width: 4.5rem;
  border-radius: 999px;
  background: var(--background);
  transition:
    transform var(--tabs-dur) var(--tabs-ease),
    width var(--tabs-dur) var(--tabs-ease);
  will-change: transform, width;
}

.t-importer-error {
  animation: importer-error-shake 150ms var(--importer-ease, ease-out);
}

@keyframes importer-modal-in {
  from {
    opacity: 0;
    transform: scale(var(--importer-scale));
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes importer-error-shake {
  0%,
  100% {
    transform: translateX(0);
  }
  30% {
    transform: translateX(-6px);
  }
  60% {
    transform: translateX(6px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .t-importer-modal,
  .t-importer-error {
    animation: none !important;
  }

  .t-importer-tabs-pill,
  .t-importer-tab {
    transition: none !important;
  }
}
</style>
