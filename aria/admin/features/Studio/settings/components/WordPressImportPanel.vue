<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";
import ShimmerText from "./ShimmerText.vue";
import WordPressImportJourney from "./WordPressImportJourney.vue";
import WordPressImportReport from "./WordPressImportReport.vue";

type ImportBatch = {
  id: string;
  sourceType: "wxr";
  status: string;
  currentMessage?: string | null;
  progressPercent?: number;
  counts?: Record<string, number>;
  summary?: {
    imported?: number;
    skipped?: number;
    failed?: number;
    warnings?: string[];
    nextSteps?: string[];
  };
};

type ImportEvent = {
  id: string;
  phase: string;
  level: "info" | "warn" | "error";
  message: string;
  completedCount?: number | null;
  totalCount?: number | null;
  createdAt: string;
};

type ImportScopeKey =
  | "posts"
  | "pages"
  | "customPostTypes"
  | "attachments"
  | "authors"
  | "terms"
  | "menus"
  | "customFields"
  | "seoFields";

type ImportScope = Record<ImportScopeKey, boolean>;
const { t } = useStudioI18n();

const defaultImportScope = (): ImportScope => ({
  posts: true,
  pages: true,
  customPostTypes: true,
  attachments: true,
  authors: true,
  terms: true,
  menus: true,
  customFields: true,
  seoFields: true,
});

const guideSteps = [
  {
    id: "source",
    label: t("import.wordpress.step.source"),
    icon: studioIcons.upload,
  },
  {
    id: "review",
    label: t("import.wordpress.step.review"),
    icon: studioIcons.task,
  },
  {
    id: "import",
    label: t("importExport.import"),
    icon: studioIcons.databaseLine,
  },
  {
    id: "report",
    label: t("import.wordpress.step.report"),
    icon: studioIcons.checkCircle,
  },
] as const;

type GuideStepId = (typeof guideSteps)[number]["id"];

const fileInput = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);
const activeBatch = ref<ImportBatch | null>(null);
const events = ref<ImportEvent[]>([]);
const activeGuideStep = ref<GuideStepId>("source");
const selectedImportScope = ref<ImportScope>(defaultImportScope());
const isUploading = ref(false);
const isApplying = ref(false);
const isRefreshing = ref(false);
let pollTimer: ReturnType<typeof window.setInterval> | null = null;

const activeStepIndex = computed(() => {
  if (isUploading.value) return 1;
  if (!activeBatch.value) return 0;
  if (activeBatch.value.status === "planned") return 2;
  if (activeBatch.value.status === "applying") return 4;
  if (
    activeBatch.value.status === "completed" ||
    activeBatch.value.status === "failed"
  ) {
    return 5;
  }
  return 1;
});

const isJourneyActive = computed(
  () =>
    isUploading.value ||
    isApplying.value ||
    activeBatch.value?.status === "applying",
);

const showJourney = computed(
  () =>
    isUploading.value ||
    isApplying.value ||
    activeBatch.value?.status === "applying" ||
    activeBatch.value?.status === "analyzing",
);

const canApply = computed(
  () =>
    activeBatch.value?.status === "planned" &&
    activeBatch.value.sourceType === "wxr" &&
    selectedImportItemCount.value > 0 &&
    !isApplying.value,
);

const currentGuideStepIndex = computed(() =>
  guideSteps.findIndex((step) => step.id === activeGuideStep.value),
);

const selectedFileLabel = computed(() => {
  if (!selectedFile.value) {
    return null;
  }
  return `${selectedFile.value.name} · ${Math.max(
    1,
    Math.round(selectedFile.value.size / 1024),
  )} KB`;
});

const importSectionControls = computed(() => {
  const counts = activeBatch.value?.counts ?? {};
  return [
    {
      key: "posts" as const,
      title: t("import.wordpress.scope.posts.title"),
      description: t("import.wordpress.scope.posts.description"),
      count: counts.posts ?? 0,
    },
    {
      key: "pages" as const,
      title: t("import.wordpress.scope.pages.title"),
      description: t("import.wordpress.scope.pages.description"),
      count: counts.pages ?? 0,
    },
    {
      key: "customPostTypes" as const,
      title: t("import.wordpress.scope.customPostTypes.title"),
      description: t("import.wordpress.scope.customPostTypes.description"),
      count: counts.customPostTypes ?? 0,
    },
    {
      key: "attachments" as const,
      title: t("import.wordpress.scope.media.title"),
      description: t("import.wordpress.scope.media.description"),
      count: counts.attachments ?? 0,
    },
    {
      key: "terms" as const,
      title: t("import.wordpress.scope.terms.title"),
      description: t("import.wordpress.scope.terms.description"),
      count: counts.terms ?? 0,
    },
    {
      key: "authors" as const,
      title: t("import.wordpress.scope.authors.title"),
      description: t("import.wordpress.scope.authors.description"),
      count: counts.authors ?? 0,
    },
    {
      key: "menus" as const,
      title: t("import.wordpress.scope.menus.title"),
      description: t("import.wordpress.scope.menus.description"),
      count: counts.menus ?? 0,
    },
    {
      key: "customFields" as const,
      title: t("import.wordpress.scope.customFields.title"),
      description: t("import.wordpress.scope.customFields.description"),
      count: counts.customFields ?? 0,
    },
    {
      key: "seoFields" as const,
      title: t("import.wordpress.scope.seoFields.title"),
      description: t("import.wordpress.scope.seoFields.description"),
      count: counts.seoFields ?? 0,
    },
  ];
});

const selectedImportItemCount = computed(() =>
  importSectionControls.value.reduce(
    (total, section) =>
      selectedImportScope.value[section.key] ? total + section.count : total,
    0,
  ),
);

const activeImportMessage = computed(
  () =>
    activeBatch.value?.currentMessage ||
    (isUploading.value
      ? t("import.wordpress.analyzing")
      : t("import.wordpress.importing")),
);

const deferredSourcePattern = new RegExp("\\bcom" + "ments?\\b", "i");

const visibleWarnings = computed(() =>
  (activeBatch.value?.summary?.warnings ?? []).filter(
    (warning) => !deferredSourcePattern.test(warning),
  ),
);

function guideStepState(index: number): "complete" | "current" | "upcoming" {
  if (index < currentGuideStepIndex.value) return "complete";
  if (index === currentGuideStepIndex.value) return "current";
  return "upcoming";
}

function chooseFile(): void {
  fileInput.value?.click();
}

function handleFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  selectedFile.value = input.files?.[0] ?? null;
  if (selectedFile.value && !activeBatch.value) {
    activeGuideStep.value = "source";
  }
}

async function refreshBatch(): Promise<void> {
  if (!activeBatch.value || isRefreshing.value) {
    return;
  }
  isRefreshing.value = true;
  try {
    const [{ data: batchData }, { data: eventData }] = await Promise.all([
      actions.wordpressImport.getBatch({ batchId: activeBatch.value.id }),
      actions.wordpressImport.getEvents({ batchId: activeBatch.value.id }),
    ]);
    if (batchData) {
      activeBatch.value = batchData as ImportBatch;
    }
    if (Array.isArray(eventData)) {
      events.value = eventData as ImportEvent[];
    }
  } finally {
    isRefreshing.value = false;
  }
}

function startPolling(): void {
  if (pollTimer) {
    return;
  }
  pollTimer = window.setInterval(() => void refreshBatch(), 1000);
}

function stopPolling(): void {
  if (!pollTimer) {
    return;
  }
  window.clearInterval(pollTimer);
  pollTimer = null;
}

async function resumeActiveImport(): Promise<void> {
  try {
    const { data } = await actions.wordpressImport.listBatches({ limit: 10 });
    const batches = Array.isArray(data) ? (data as ImportBatch[]) : [];
    const resumable = batches.find((batch) =>
      ["uploading", "analyzing", "applying"].includes(batch.status),
    );
    if (!resumable) {
      return;
    }
    activeBatch.value = resumable;
    activeGuideStep.value =
      resumable.status === "applying" || resumable.status === "analyzing"
        ? "import"
        : "review";
    await refreshBatch();
    startPolling();
  } catch {
    // Import resume is a convenience; the visible controls still work without it.
  }
}

async function uploadAndAnalyze(): Promise<void> {
  if (!selectedFile.value) {
    toast.error("Choose a WordPress WXR/XML export first");
    return;
  }

  isUploading.value = true;
  startPolling();
  try {
    const formData = new FormData();
    formData.append("file", selectedFile.value);
    const { data, error } = await actions.wordpressImport.upload(formData);
    if (error) {
      throw new Error(error.message);
    }
    activeBatch.value = (data as { batch: ImportBatch }).batch;
    await refreshBatch();
    selectedImportScope.value = defaultImportScope();
    activeGuideStep.value = "review";
    toast.success("WordPress source analyzed");
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Import analysis failed",
    );
  } finally {
    isUploading.value = false;
    if (activeBatch.value?.status !== "applying") {
      stopPolling();
    }
  }
}

async function applyImport(): Promise<void> {
  if (!activeBatch.value) {
    return;
  }
  isApplying.value = true;
  activeGuideStep.value = "import";
  startPolling();
  try {
    const { data, error } = await actions.wordpressImport.apply({
      batchId: activeBatch.value.id,
      scope: selectedImportScope.value,
    });
    if (error) {
      throw new Error(error.message);
    }
    activeBatch.value = data as ImportBatch;
    await refreshBatch();
    activeGuideStep.value = "report";
    if (activeBatch.value.status === "completed") {
      toast.success("WordPress import complete");
    } else {
      toast.warning("WordPress import finished with warnings");
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Import failed");
  } finally {
    isApplying.value = false;
    stopPolling();
  }
}

function goToSourceStep(): void {
  activeGuideStep.value = "source";
}

function goToReviewStep(): void {
  if (!activeBatch.value) {
    return;
  }
  activeGuideStep.value = "review";
}

function resetImportFlow(): void {
  selectedFile.value = null;
  activeBatch.value = null;
  events.value = [];
  selectedImportScope.value = defaultImportScope();
  activeGuideStep.value = "source";
  if (fileInput.value) {
    fileInput.value.value = "";
  }
}

function toggleImportSection(key: ImportScopeKey): void {
  selectedImportScope.value = {
    ...selectedImportScope.value,
    [key]: !selectedImportScope.value[key],
  };
}

onMounted(() => {
  void resumeActiveImport();
});

onBeforeUnmount(() => stopPolling());
</script>

<template>
  <div
    class="relative min-h-[34rem] space-y-8 px-10 py-7"
    role="region"
    :aria-label="t('import.wordpress.aria')"
  >
    <div class="max-w-3xl space-y-2">
      <h4 class="m-0 font-serif text-xl font-medium text-foreground">
        {{ t("import.wordpress.title") }}
      </h4>
      <p
        class="max-w-2xl text-sm leading-relaxed text-balance text-muted-foreground"
      >
        {{ t("import.wordpress.description") }}
      </p>
    </div>

    <ol
      class="flex max-w-3xl items-center gap-2 border-b border-border/70 pb-4"
      :aria-label="t('import.wordpress.progress')"
    >
      <li
        v-for="(step, index) in guideSteps"
        :key="step.id"
        class="flex min-w-0 items-center gap-2"
        :data-state="guideStepState(index)"
        :aria-current="index === currentGuideStepIndex ? 'step' : undefined"
      >
        <span
          class="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium tabular-nums transition-colors"
          :class="[
            guideStepState(index) === 'complete'
              ? 'bg-primary text-primary-foreground'
              : guideStepState(index) === 'current'
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground',
          ]"
        >
          {{ index + 1 }}
        </span>
        <span
          class="truncate text-xs font-medium transition-colors"
          :class="[
            guideStepState(index) === 'current'
              ? 'text-foreground'
              : guideStepState(index) === 'complete'
                ? 'text-foreground/80'
                : 'text-muted-foreground/70',
          ]"
        >
          {{ step.label }}
        </span>
        <span
          v-if="index < guideSteps.length - 1"
          class="h-px w-8 bg-border/70"
          aria-hidden="true"
        />
      </li>
    </ol>

    <input
      ref="fileInput"
      class="hidden"
      :aria-label="t('import.wordpress.chooseAria')"
      type="file"
      accept=".xml,.wxr,application/xml,text/xml"
      @change="handleFileChange"
    />

    <div class="max-w-3xl">
      <div v-if="activeGuideStep === 'source'" class="space-y-5">
        <div
          class="flex flex-wrap items-center justify-between gap-4 border-b border-border/70 pb-5"
        >
          <div class="min-w-0 space-y-1">
            <p class="truncate text-sm font-medium text-foreground">
              {{ selectedFileLabel ?? t("import.wordpress.noXml") }}
            </p>
            <p class="text-xs leading-relaxed text-muted-foreground">
              {{ t("import.wordpress.xmlHint") }}
            </p>
          </div>
          <div class="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              class="h-9"
              :disabled="isUploading"
              @click="chooseFile"
            >
              <span :class="[studioIcons.upload, 'mr-2 size-4']" />
              {{ t("import.wordpress.chooseXml") }}
            </Button>
            <Button
              variant="default"
              size="sm"
              class="h-9"
              :disabled="!selectedFile || isUploading"
              @click="uploadAndAnalyze"
            >
              <span
                :class="[
                  isUploading ? studioIcons.loading : studioIcons.search,
                  'mr-2 size-4',
                  isUploading && 'animate-spin',
                ]"
              />
              {{
                isUploading
                  ? t("import.wordpress.analyzing")
                  : t("import.wordpress.analyzeXml")
              }}
            </Button>
          </div>
        </div>
      </div>

      <div
        v-else-if="activeGuideStep === 'review' && activeBatch"
        class="space-y-6"
      >
        <div class="space-y-1.5">
          <h4 class="m-0 font-serif text-xl font-medium text-foreground">
            {{ t("import.wordpress.review.title") }}
          </h4>
          <p class="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {{ t("import.wordpress.review.description") }}
          </p>
        </div>

        <div class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h5
              class="m-0 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground"
            >
              {{ t("import.wordpress.review.whatToImport") }}
            </h5>
            <span class="text-xs text-muted-foreground">
              {{ t("import.wordpress.review.uncheckedSkipped") }}
            </span>
          </div>
          <div class="divide-y divide-border/70 border-y border-border/70">
            <button
              v-for="section in importSectionControls"
              :key="section.key"
              type="button"
              class="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3 text-left transition-opacity hover:bg-muted/20"
              :class="[
                selectedImportScope[section.key] ? 'opacity-100' : 'opacity-45',
              ]"
              :aria-pressed="selectedImportScope[section.key]"
              @click="toggleImportSection(section.key)"
            >
              <Checkbox
                class="shrink-0"
                :model-value="selectedImportScope[section.key]"
                @click.stop
                @update:model-value="toggleImportSection(section.key)"
              />
              <span class="min-w-0 flex-1">
                <span class="text-sm font-medium text-foreground">
                  {{ section.title }}
                </span>
                <span
                  class="mt-0.5 block text-xs leading-relaxed text-muted-foreground"
                >
                  {{ section.description }}
                </span>
              </span>
              <span class="shrink-0 text-sm tabular-nums text-muted-foreground">
                {{ section.count }}
              </span>
            </button>
          </div>
        </div>

        <div
          v-if="visibleWarnings.length"
          class="border-l border-amber-500/50 py-1 pl-4"
        >
          <p
            class="text-xs font-medium uppercase tracking-[0.18em] text-amber-600"
          >
            {{ t("import.wordpress.review.needsAttention") }}
          </p>
          <ul class="mt-3 space-y-1 text-sm text-muted-foreground">
            <li v-for="warning in visibleWarnings" :key="warning">
              {{ warning }}
            </li>
          </ul>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            class="h-9"
            :disabled="isApplying"
            @click="goToSourceStep"
          >
            <span :class="[studioIcons.arrowLeft, 'mr-2 size-4']" />
            {{ t("import.wordpress.review.back") }}
          </Button>
          <Button
            variant="default"
            size="sm"
            class="h-9"
            :disabled="!canApply"
            @click="applyImport"
          >
            <span :class="[studioIcons.upload, 'mr-2 size-4']" />
            {{ t("import.wordpress.review.importSelected") }}
          </Button>
        </div>
      </div>

      <div
        v-else-if="activeGuideStep === 'import'"
        class="flex min-h-[22rem] items-center justify-center"
      >
        <div class="max-w-md text-center">
          <span
            :class="[
              studioIcons.loading,
              'mx-auto block size-8 animate-spin text-primary',
            ]"
          />
          <p
            class="mt-5 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground"
          >
            Importing WordPress
          </p>
          <h4 class="mt-3 font-serif text-2xl font-medium text-foreground">
            <ShimmerText :text="activeImportMessage" />
          </h4>
          <div class="mt-6 h-1 overflow-hidden rounded-full bg-muted">
            <div
              class="h-full rounded-full bg-primary transition-all duration-300"
              :style="{
                width: `${Math.max(
                  0,
                  Math.min(Math.round(activeBatch?.progressPercent ?? 0), 100),
                )}%`,
              }"
            />
          </div>
          <p class="mt-4 text-xs text-muted-foreground">
            Settings can be reopened while this runs; Aria will resume the
            active import journey.
          </p>
        </div>
      </div>

      <div
        v-else-if="activeGuideStep === 'report' && activeBatch"
        class="space-y-6"
      >
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="space-y-2">
            <h4 class="m-0 font-serif text-xl font-medium text-foreground">
              Import report
            </h4>
            <p class="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Review what Aria imported, skipped, or could not process from the
              WordPress XML export.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            class="h-9"
            @click="resetImportFlow"
          >
            <span :class="[studioIcons.refresh, 'mr-2 size-4']" />
            New Import
          </Button>
        </div>
        <WordPressImportReport :batch="activeBatch" />
        <div class="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            class="h-9"
            @click="goToReviewStep"
          >
            <span :class="[studioIcons.arrowLeft, 'mr-2 size-4']" />
            Review Plan
          </Button>
          <Button
            variant="default"
            size="sm"
            class="h-9"
            @click="resetImportFlow"
          >
            <span :class="[studioIcons.upload, 'mr-2 size-4']" />
            Import Another XML
          </Button>
        </div>
      </div>
    </div>

    <WordPressImportJourney
      v-if="showJourney"
      :batch="activeBatch"
      :events="events"
      :is-active="isJourneyActive"
      :active-step-index="activeStepIndex"
    />
  </div>
</template>
