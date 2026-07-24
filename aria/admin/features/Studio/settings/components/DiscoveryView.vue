<script setup lang="ts">
import { computed, onActivated, onMounted, onUnmounted, ref, watch } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCapabilities } from "@/composables/useCapabilities";
import { useSiteSettings } from "@/composables/useSiteSettings";
import {
  parseDiscoveryArtifactsPayload,
  parseDiscoveryGeneratedBaselinePayload,
  parseDiscoveryReportPayload,
} from "@/composables/discoveryActionResults";
import type { DiscoverySettings } from "@/lib/crawl/schemas";
import { parseDiscoverySettings } from "@/lib/crawl/schemas";
import { useStudioRouter } from "@/features/Studio/core/composables";
import { useStudioCapabilities } from "@/composables/useStudioCapabilities";
import { useStudioI18n } from "@/i18n";
import SettingsRow from "./SettingsRow.vue";
import DiscoveryOverviewPanel from "./DiscoveryOverviewPanel.vue";
import DiscoveryArtifactPanel from "./DiscoveryArtifactPanel.vue";
import SettingsReadOnlyNotice from "./SettingsReadOnlyNotice.vue";
import { useDebouncedSettingsSave } from "../composables/useDebouncedSettingsSave";
import { useSettingsDialog } from "../composables/useSettingsDialog";
import { useSettingsTabReset } from "../composables/useSettingsTabReset";
import { resolveArtifactCustomSeed } from "../lib/discoveryArtifactSeed";
import {
  getArtifactUnavailableReason,
  type DiscoveryArtifactKind,
} from "../lib/discoveryArtifactUnavailable";
import {
  DISCOVERY_ARTIFACT_PANEL_CHROME_PX,
  discoveryArtifactEditorHeightPx,
} from "../lib/discoveryArtifactEditorLayout";
import { localizeDiscoveryHealthCheck } from "../lib/discoveryHealthI18n";

type DiscoveryTab = "overview" | "files" | "search";

const { hasCapability } = useCapabilities();
const canEditDiscovery = computed(() => hasCapability("editDiscoverySettings"));
const {
  generalSettings,
  discoverySettings,
  loadSettings,
  updateDiscoverySettings,
} = useSiteSettings();
const settingsDialog = useSettingsDialog();
const router = useStudioRouter();
const { canEditPageSeo } = useStudioCapabilities();
const { t } = useStudioI18n();
let unregisterDiscoveryFlush: (() => void) | null = null;
let hydrateInFlight: Promise<void> | null = null;

const isLoading = ref(true);
const isApplyingRemoteDiscovery = ref(false);
const isPingToggleSaving = ref(false);
const editingArtifact = ref<DiscoveryArtifactKind | null>(null);
const isArtifactActionLoading = ref(false);
const activeDiscoveryTab = ref<DiscoveryTab>("overview");
const report = ref<Awaited<
  ReturnType<typeof parseDiscoveryReportPayload>
> | null>(null);
const artifacts = ref<Awaited<
  ReturnType<typeof parseDiscoveryArtifactsPayload>
> | null>(null);

function normalizeDiscoveryForm(
  settings: DiscoverySettings,
): DiscoverySettings {
  return {
    ...settings,
    aiBotPolicy: settings.aiBotPolicy ?? "allow-all",
    sitemapPingOnPublish: settings.sitemapPingOnPublish ?? false,
  };
}

function patchForm(patch: Partial<DiscoverySettings>): void {
  form.value = normalizeDiscoveryForm({
    ...form.value,
    ...patch,
  });
}

const form = ref<DiscoverySettings>(
  normalizeDiscoveryForm({ ...discoverySettings.value }),
);
const lastSavedForm = ref<DiscoverySettings>({ ...form.value });

const discourageSearchEngines = computed({
  get: () => form.value.discourageSearchEngines,
  set: (value: boolean) => {
    patchForm({ discourageSearchEngines: value });
  },
});

const pingOnPublish = computed({
  get: () => Boolean(form.value.sitemapPingOnPublish),
  set: (next: boolean) => {
    void setSitemapPingOnPublish(next);
  },
});

async function setSitemapPingOnPublish(next: boolean): Promise<void> {
  if (!canEditDiscovery.value || isPingToggleSaving.value) return;

  const previous = Boolean(form.value.sitemapPingOnPublish);
  if (previous === next) return;

  isPingToggleSaving.value = true;
  isApplyingRemoteDiscovery.value = true;
  patchForm({ sitemapPingOnPublish: next });

  try {
    await updateDiscoverySettings({ sitemapPingOnPublish: next });
    const merged = normalizeDiscoveryForm(discoverySettings.value);
    lastSavedForm.value = { ...merged };
    form.value = merged;
    debouncedSave.markSaved(merged);
  } catch (error) {
    patchForm({ sitemapPingOnPublish: previous });
    toast.error(
      error instanceof Error
        ? error.message
        : t("settings.discovery.pingSaveFailed"),
    );
  } finally {
    isApplyingRemoteDiscovery.value = false;
    isPingToggleSaving.value = false;
  }
}

function buildDiscoveryPatch(
  next: DiscoverySettings,
  previous: DiscoverySettings,
): Partial<DiscoverySettings> {
  return {
    ...(next.sitemapMode !== previous.sitemapMode
      ? { sitemapMode: next.sitemapMode }
      : {}),
    ...(next.sitemapCustom !== previous.sitemapCustom
      ? { sitemapCustom: next.sitemapCustom }
      : {}),
    ...(next.robotsMode !== previous.robotsMode
      ? { robotsMode: next.robotsMode }
      : {}),
    ...(next.robotsCustom !== previous.robotsCustom
      ? { robotsCustom: next.robotsCustom }
      : {}),
    ...(next.includeSitemapInRobots !== previous.includeSitemapInRobots
      ? { includeSitemapInRobots: next.includeSitemapInRobots }
      : {}),
    ...(next.llmsMode !== previous.llmsMode ? { llmsMode: next.llmsMode } : {}),
    ...(next.llmsCustom !== previous.llmsCustom
      ? { llmsCustom: next.llmsCustom }
      : {}),
    ...(next.discourageSearchEngines !== previous.discourageSearchEngines
      ? { discourageSearchEngines: next.discourageSearchEngines }
      : {}),
    ...(next.googleSiteVerification !== previous.googleSiteVerification
      ? { googleSiteVerification: next.googleSiteVerification }
      : {}),
    ...(next.bingSiteVerification !== previous.bingSiteVerification
      ? { bingSiteVerification: next.bingSiteVerification }
      : {}),
    ...(next.trailingSlashPolicy !== previous.trailingSlashPolicy
      ? { trailingSlashPolicy: next.trailingSlashPolicy }
      : {}),
    ...(next.llmsAiPolicy !== previous.llmsAiPolicy
      ? { llmsAiPolicy: next.llmsAiPolicy }
      : {}),
    ...(next.aiBotPolicy !== previous.aiBotPolicy
      ? { aiBotPolicy: next.aiBotPolicy }
      : {}),
    ...(next.sitemapPingOnPublish !== previous.sitemapPingOnPublish
      ? { sitemapPingOnPublish: next.sitemapPingOnPublish }
      : {}),
  };
}

const debouncedSave = useDebouncedSettingsSave<DiscoverySettings>({
  getPayload: () => form.value,
  serialize: (payload) => JSON.stringify(payload),
  save: async (payload) => {
    if (!canEditDiscovery.value) return;
    const patch = buildDiscoveryPatch(payload, lastSavedForm.value);
    if (Object.keys(patch).length === 0) return;
    await updateDiscoverySettings(patch);
    const merged = normalizeDiscoveryForm(discoverySettings.value);
    lastSavedForm.value = { ...merged };
    isApplyingRemoteDiscovery.value = true;
    try {
      form.value = merged;
      debouncedSave.markSaved(merged);
    } finally {
      isApplyingRemoteDiscovery.value = false;
    }
    await refreshDiscoveryData(false, { skipFormSync: true });
  },
  onError: async (error) => {
    toast.error(
      error instanceof Error
        ? error.message
        : t("settings.discovery.saveFailed"),
    );
    await restoreDiscoveryFormFromServer();
  },
});

debouncedSave.markSaved(form.value);

function syncFormFromSettings(
  source: DiscoverySettings = discoverySettings.value,
): void {
  if (
    isPingToggleSaving.value ||
    debouncedSave.isDirty() ||
    debouncedSave.isSaving.value
  ) {
    return;
  }

  const normalized = normalizeDiscoveryForm({ ...source });
  const prevPing = Boolean(form.value.sitemapPingOnPublish);
  const nextPing = Boolean(normalized.sitemapPingOnPublish);

  isApplyingRemoteDiscovery.value = true;
  try {
    debouncedSave.markSaved(normalized);
    lastSavedForm.value = { ...normalized };
    form.value = normalized;
  } finally {
    isApplyingRemoteDiscovery.value = false;
  }
}

async function loadReport(_options?: {
  duringHydrate?: boolean;
  skipFormSync?: boolean;
}): Promise<void> {
  const { data, error } = await actions.discovery.getReport({});
  if (error) {
    throw new Error(error.message ?? t("settings.discovery.loadReportFailed"));
  }
  const parsed = parseDiscoveryReportPayload(data);
  report.value = parsed;
}

watch(
  discoverySettings,
  (next) => {
    if (
      isApplyingRemoteDiscovery.value ||
      isPingToggleSaving.value ||
      debouncedSave.isDirty() ||
      debouncedSave.isSaving.value
    ) {
      return;
    }
    syncFormFromSettings(next);
  },
  { immediate: true },
);

watch(
  form,
  () => {
    if (isApplyingRemoteDiscovery.value || !canEditDiscovery.value) return;
    debouncedSave.scheduleSave();
  },
  { deep: true },
);

function openIndexabilityRow(slug: string): void {
  if (canEditPageSeo.value) {
    router.navigateTo(`/pages/${slug}?tab=seo`);
    return;
  }
  router.navigateTo(`/pages/${slug}`);
}

async function loadArtifacts(): Promise<void> {
  const { data, error } = await actions.discovery.getArtifacts({});
  if (error) {
    throw new Error(error.message ?? t("settings.discovery.loadArtifactsFailed"));
  }
  artifacts.value = parseDiscoveryArtifactsPayload(data);
}

async function refreshDiscoveryData(
  duringHydrate = false,
  options?: { skipFormSync?: boolean },
): Promise<void> {
  try {
    await loadReport({ duringHydrate, skipFormSync: options?.skipFormSync });
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : t("settings.discovery.refreshReportFailed"),
    );
  }

  try {
    await loadArtifacts();
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : t("settings.discovery.refreshArtifactsFailed"),
    );
  }
}

async function restoreDiscoveryFormFromServer(): Promise<void> {
  try {
    await loadSettings({ force: true });
    if (!debouncedSave.isDirty()) {
      syncFormFromSettings();
    }
    await refreshDiscoveryData(false, { skipFormSync: true });
  } catch (error) {
    toast.error(
      error instanceof Error
        ? t("settings.discovery.restoreFailedWithMessage", { message: error.message })
        : t("settings.discovery.restoreFailed"),
    );
  }
}

async function performDiscoveryHydrate(forceSettings: boolean): Promise<void> {
  await loadSettings(forceSettings ? { force: true } : undefined);
  if (!debouncedSave.isDirty() && !isPingToggleSaving.value) {
    syncFormFromSettings();
  }
  await refreshDiscoveryData(true, { skipFormSync: true });
}

/** Reload health/artifacts from the DB; form state comes from settings.get only. */
async function hydrateDiscoveryTab(forceSettings = true): Promise<void> {
  if (hydrateInFlight) {
    await hydrateInFlight;
  }

  hydrateInFlight = performDiscoveryHydrate(forceSettings).finally(() => {
    hydrateInFlight = null;
  });
  await hydrateInFlight;
}

useSettingsTabReset({
  tabId: "discovery",
  enabled: canEditDiscovery,
  title: t("settings.discovery.reset.title"),
  description: t("settings.discovery.reset.description"),
  warning: t("settings.discovery.reset.warning"),
  items: [
    t("settings.discovery.reset.item.robotsSitemap"),
    t("settings.discovery.reset.item.llms"),
    t("settings.discovery.reset.item.verification"),
    t("settings.discovery.reset.item.trailingSlashPing"),
    t("settings.discovery.aiBotPolicy"),
  ],
  reset: async () => {
    if (!canEditDiscovery.value) {
      throw new Error(t("settings.discovery.noPermission"));
    }

    await debouncedSave.flushSave();
    const defaults = parseDiscoverySettings({});
    await updateDiscoverySettings({
      ...defaults,
      robotsCustom: undefined,
      llmsCustom: undefined,
      googleSiteVerification: undefined,
      bingSiteVerification: undefined,
      llmsAiPolicy: undefined,
    });
    syncFormFromSettings();
    await refreshDiscoveryData(true, { skipFormSync: true });
  },
});

onMounted(async () => {
  unregisterDiscoveryFlush = settingsDialog.registerFlushCallback(
    debouncedSave.flushSave,
  );

  isLoading.value = true;
  try {
    await hydrateDiscoveryTab(true);
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : t("settings.discovery.loadFailed"),
    );
  } finally {
    isLoading.value = false;
  }
});

onUnmounted(() => {
  unregisterDiscoveryFlush?.();
  unregisterDiscoveryFlush = null;
  void debouncedSave.flushSave().finally(() => {
    debouncedSave.dispose();
  });
});

onActivated(() => {
  void hydrateDiscoveryTab(true);
});

watch(
  () => settingsDialog.activeTab.value,
  (tab) => {
    if (tab !== "discovery") {
      void debouncedSave.flushSave();
      return;
    }
    if (tab === "discovery") {
      void hydrateDiscoveryTab(true);
    }
  },
);

const siteUrlBase = computed(() =>
  generalSettings.value.siteUrl.replace(/\/+$/, ""),
);
const hasValidSiteUrl = computed(() => siteUrlBase.value.length > 0);

function buildLiveArtifactUrl(path: string): string | undefined {
  if (!siteUrlBase.value) {
    return undefined;
  }
  const version = artifacts.value?.generatedAt
    ? `?v=${encodeURIComponent(artifacts.value.generatedAt)}`
    : "";
  return `${siteUrlBase.value}${path}${version}`;
}

const healthChecks = computed(() => {
  const currentReport = report.value;
  if (!currentReport) return [];

  return currentReport.health.checks.map((check) =>
    localizeDiscoveryHealthCheck(check, {
      rows: currentReport.rows,
      audits: currentReport.audits,
      t,
    }),
  );
});
const isReportLoading = computed(() => report.value === null);

const indexabilityRows = computed(() => {
  const rows = report.value?.rows ?? [];
  return [...rows].sort((a, b) => {
    const byTitle = a.title.localeCompare(b.title, undefined, {
      sensitivity: "base",
    });
    if (byTitle !== 0) {
      return byTitle;
    }
    return a.publicPath.localeCompare(b.publicPath, undefined, {
      sensitivity: "base",
    });
  });
});

function artifactMode(kind: DiscoveryArtifactKind): "auto" | "custom" | "off" {
  if (kind === "robots") {
    return form.value.robotsMode === "custom" ? "custom" : "auto";
  }
  if (kind === "sitemap") {
    return form.value.sitemapMode;
  }
  return form.value.llmsMode;
}

function artifactCustomValue(kind: DiscoveryArtifactKind): string {
  if (kind === "robots") return form.value.robotsCustom ?? "";
  if (kind === "sitemap") return form.value.sitemapCustom ?? "";
  return form.value.llmsCustom ?? "";
}

function artifactPreview(kind: DiscoveryArtifactKind): string {
  if (kind === "robots") return artifacts.value?.robots ?? "";
  if (kind === "sitemap") return artifacts.value?.sitemap ?? "";
  return artifacts.value?.llms ?? "";
}

function artifactUnavailableReason(kind: DiscoveryArtifactKind): string | null {
  return getArtifactUnavailableReason({
    kind,
    mode: artifactMode(kind),
    preview: artifactPreview(kind),
    discourageSearchEngines: form.value.discourageSearchEngines,
    hasSiteUrl: hasValidSiteUrl.value,
    t,
  });
}

async function fetchGeneratedBaseline(
  kind: DiscoveryArtifactKind,
): Promise<string> {
  const { data, error } = await actions.discovery.getGeneratedBaseline({
    artifact: kind,
  });
  if (error) {
    throw new Error(error.message ?? t("settings.discovery.loadBaselineFailed"));
  }
  const baseline = parseDiscoveryGeneratedBaselinePayload(data);
  return baseline.content ?? "";
}

async function customizeArtifact(kind: DiscoveryArtifactKind): Promise<void> {
  if (!canEditDiscovery.value) return;

  isArtifactActionLoading.value = true;
  try {
    const existing = artifactCustomValue(kind);
    const baseline = existing.trim()
      ? null
      : await fetchGeneratedBaseline(kind);
    const seed = resolveArtifactCustomSeed(existing, baseline);

    if (kind === "robots") {
      patchForm({ robotsMode: "custom", robotsCustom: seed });
    } else if (kind === "sitemap") {
      patchForm({ sitemapMode: "custom", sitemapCustom: seed });
    } else {
      patchForm({ llmsMode: "custom", llmsCustom: seed });
    }

    editingArtifact.value = kind;
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : t("settings.discovery.startOverrideFailed"),
    );
  } finally {
    isArtifactActionLoading.value = false;
  }
}

function updateArtifactCustomValue(
  kind: DiscoveryArtifactKind,
  value: string,
): void {
  if (kind === "robots") {
    patchForm({ robotsMode: "custom", robotsCustom: value });
    return;
  }
  if (kind === "sitemap") {
    patchForm({ sitemapMode: "custom", sitemapCustom: value });
    return;
  }
  patchForm({ llmsMode: "custom", llmsCustom: value });
}

function revertArtifact(kind: DiscoveryArtifactKind): void {
  if (kind === "robots") {
    patchForm({ robotsMode: "auto", robotsCustom: undefined });
  } else if (kind === "sitemap") {
    patchForm({ sitemapMode: "auto", sitemapCustom: undefined });
  } else {
    patchForm({ llmsMode: "auto", llmsCustom: undefined });
  }
  if (editingArtifact.value === kind) {
    editingArtifact.value = null;
  }
}

function disableArtifact(kind: DiscoveryArtifactKind): void {
  if (kind === "robots") return;
  if (kind === "sitemap") {
    patchForm({ sitemapMode: "off" });
  } else {
    patchForm({ llmsMode: "off" });
  }
  if (editingArtifact.value === kind) {
    editingArtifact.value = null;
  }
}

async function enableArtifact(kind: DiscoveryArtifactKind): Promise<void> {
  if (kind === "robots") {
    patchForm({ robotsMode: "auto", robotsCustom: undefined });
    return;
  }

  if (kind === "sitemap") {
    patchForm({ sitemapMode: "auto", sitemapCustom: undefined });
  } else {
    patchForm({ llmsMode: "auto", llmsCustom: undefined });
  }
}

const activeArtifact = ref<DiscoveryArtifactKind>("robots");

const artifactTabs = [
  {
    kind: "robots" as const,
    label: "robots.txt",
    path: "/robots.txt",
    language: "plain" as const,
    allowDisable: false,
  },
  {
    kind: "sitemap" as const,
    label: "sitemap.xml",
    path: "/sitemap.xml",
    language: "xml" as const,
    allowDisable: true,
    disabledMessage: t("settings.discovery.artifact.sitemapNotPublished"),
  },
  {
    kind: "llms" as const,
    label: "llms.txt",
    path: "/llms.txt",
    language: "plain" as const,
    allowDisable: true,
    disabledMessage: t("settings.discovery.artifact.llmsNotPublished"),
  },
];

function segmentedTabClass(kind: DiscoveryArtifactKind): string {
  const base = "segmented-tab w-full";
  return activeArtifact.value === kind ? `${base} segmented-tab-active` : base;
}

watch(activeArtifact, (next) => {
  if (editingArtifact.value && editingArtifact.value !== next) {
    editingArtifact.value = null;
  }
});

function artifactEditorValue(kind: DiscoveryArtifactKind): string {
  if (editingArtifact.value === kind) {
    return artifactCustomValue(kind);
  }
  if (artifactMode(kind) === "custom") {
    return artifactCustomValue(kind) || artifactPreview(kind);
  }
  return artifactPreview(kind);
}

const discoverySlidePanelHeight = computed(() => {
  const kind = activeArtifact.value;
  const mode = artifactMode(kind);

  if (mode === "off") {
    return "9.5rem";
  }

  const value = artifactEditorValue(kind);
  const hasContent = value.trim().length > 0;
  const unavailable = artifactUnavailableReason(kind);

  if (!hasContent && !editingArtifact.value && unavailable) {
    return "9.5rem";
  }

  const lineCount = value.split("\n").length;
  const editorHeight = discoveryArtifactEditorHeightPx(lineCount);
  return `${editorHeight + DISCOVERY_ARTIFACT_PANEL_CHROME_PX}px`;
});
</script>

<template>
  <div class="min-w-0 space-y-0 bg-background page-card-enter">
    <div
      class="sticky top-0 z-10 flex h-12 shrink-0 items-stretch gap-1 border-b border-dashed border-border bg-background px-7 inset-shadow-xs"
      role="tablist"
      :aria-label="t('settings.meta.discovery.title')"
    >
      <Button
        type="button"
        size="tab"
        role="tab"
        :aria-selected="activeDiscoveryTab === 'overview'"
        :variant="activeDiscoveryTab === 'overview' ? 'tab-active' : 'tab'"
        @click="activeDiscoveryTab = 'overview'"
      >
        {{ t("settings.discovery.tabs.overview") }}
      </Button>
      <Button
        type="button"
        size="tab"
        role="tab"
        :aria-selected="activeDiscoveryTab === 'files'"
        :variant="activeDiscoveryTab === 'files' ? 'tab-active' : 'tab'"
        @click="activeDiscoveryTab = 'files'"
      >
        {{ t("settings.discovery.tabs.files") }}
      </Button>
      <Button
        type="button"
        size="tab"
        role="tab"
        :aria-selected="activeDiscoveryTab === 'search'"
        :variant="activeDiscoveryTab === 'search' ? 'tab-active' : 'tab'"
        @click="activeDiscoveryTab = 'search'"
      >
        {{ t("settings.discovery.tabs.search") }}
      </Button>
    </div>

    <div class="px-10 py-7">
      <div
        class="mx-auto max-w-4xl space-y-12"
        role="form"
        :aria-label="t('settings.discovery.formLabel')"
      >
        <SettingsReadOnlyNotice v-if="!canEditDiscovery" />

    <p
      v-if="!hasValidSiteUrl"
      class="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100"
    >
      {{ t("settings.discovery.siteUrlRequired") }}
    </p>

    <DiscoveryOverviewPanel
      v-if="activeDiscoveryTab === 'overview'"
      :score="report?.health.score ?? 0"
      :checks="healthChecks"
      :loading="isReportLoading"
      v-model:discourage-search-engines="discourageSearchEngines"
      :disabled="!canEditDiscovery || isLoading"
    />

    <SettingsRow
      v-if="activeDiscoveryTab === 'files'"
      :label="t('settings.discovery.aiBotPolicy')"
    >
      <select
        :value="form.aiBotPolicy"
        class="h-9 rounded-md border border-input bg-input px-3 text-sm"
        :disabled="!canEditDiscovery || isLoading"
        @change="
          patchForm({
            aiBotPolicy: ($event.target as HTMLSelectElement)
              .value as DiscoverySettings['aiBotPolicy'],
          })
        "
      >
        <option value="allow-all">{{ t("settings.discovery.aiPolicy.allowAll") }}</option>
        <option value="block-training">{{ t("settings.discovery.aiPolicy.blockTraining") }}</option>
      </select>
    </SettingsRow>

    <section
      v-if="activeDiscoveryTab === 'files'"
      class="overflow-hidden rounded-sm bg-background"
    >
      <div
        class="grid grid-cols-3 gap-1 border-b border-dashed border-border/50 p-2"
      >
        <button
          v-for="tab in artifactTabs"
          :key="tab.kind"
          type="button"
          :class="segmentedTabClass(tab.kind)"
          @click="activeArtifact = tab.kind"
        >
          {{ tab.label }}
        </button>
      </div>

      <div
        class="slide-panel-root slide-panel-root--discovery"
        :data-active="activeArtifact"
        :style="{ height: discoverySlidePanelHeight }"
      >
        <DiscoveryArtifactPanel
          v-for="tab in artifactTabs"
          :key="tab.kind"
          :data-panel="tab.kind"
          class="slide-panel"
          :mode="artifactMode(tab.kind)"
          :custom-value="artifactCustomValue(tab.kind)"
          :preview="artifactPreview(tab.kind)"
          :unavailable-reason="artifactUnavailableReason(tab.kind)"
          :live-url="buildLiveArtifactUrl(tab.path)"
          :can-edit="canEditDiscovery"
          :allow-disable="tab.allowDisable"
          :is-editing="editingArtifact === tab.kind"
          :is-loading="isLoading || isArtifactActionLoading"
          :language="tab.language"
          :disabled-message="tab.disabledMessage"
          @customize="void customizeArtifact(tab.kind)"
          @revert="revertArtifact(tab.kind)"
          @disable="disableArtifact(tab.kind)"
          @enable="void enableArtifact(tab.kind)"
          @done="editingArtifact = null"
          @update:custom-value="updateArtifactCustomValue(tab.kind, $event)"
        />
      </div>
    </section>

    <SettingsRow
      v-if="activeDiscoveryTab === 'search'"
      :label="t('settings.discovery.pingOnPublish')"
      :description="t('settings.discovery.pingOnPublishDescription')"
    >
      <Switch
        id="discovery-ping-toggle"
        v-model:checked="pingOnPublish"
        :disabled="!canEditDiscovery || isLoading || isPingToggleSaving"
        class="data-[state=unchecked]:bg-input"
      />
    </SettingsRow>

    <SettingsRow
      v-if="activeDiscoveryTab === 'search'"
      :label="t('settings.discovery.googleVerification')"
      :description="t('settings.discovery.searchConsoleToken')"
    >
      <Input
        :model-value="form.googleSiteVerification ?? ''"
        class="w-full h-9.5! hover:bg-background! bg-input! border-border/50"
        :disabled="!canEditDiscovery || isLoading"
        @update:model-value="patchForm({ googleSiteVerification: $event })"
      />
    </SettingsRow>

    <SettingsRow
      v-if="activeDiscoveryTab === 'search' && form.googleSiteVerification?.trim()"
      :label="t('settings.discovery.googleSearchConsole')"
      :description="t('settings.discovery.searchConsoleLinkDescription')"
    >
      <a
        class="text-sm text-primary underline-offset-4 hover:underline"
        href="https://search.google.com/search-console"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ t("settings.discovery.openSearchConsole") }}
      </a>
    </SettingsRow>

    <SettingsRow
      v-if="activeDiscoveryTab === 'search'"
      :label="t('settings.discovery.bingVerification')"
      :description="t('settings.discovery.webmasterToolsToken')"
    >
      <Input
        :model-value="form.bingSiteVerification ?? ''"
        class="w-full h-9.5! hover:bg-background! bg-input! border-border/50"
        :disabled="!canEditDiscovery || isLoading"
        @update:model-value="patchForm({ bingSiteVerification: $event })"
      />
    </SettingsRow>

    <div
      v-if="activeDiscoveryTab === 'overview'"
      class="space-y-3"
      :aria-busy="isReportLoading"
    >
      <div class="space-y-1">
        <h3 class="text-md font-medium text-foreground">{{ t("settings.discovery.indexability") }}</h3>
        <p class="text-sm leading-0 pb-6 text-muted-foreground/50">
          {{ t("settings.discovery.indexabilityDescription") }}
        </p>
      </div>
      <div
        class="rounded-md border border-border/50 border-solid bg-background overflow-hidden px-0"
      >
        <div class="overflow-x-auto">
          <Table class="border-collapse table-auto w-full">
            <TableHeader
              class="hover:bg-card/50! border-b border-border border-dashed bg-card/50!"
            >
              <TableRow>
                <TableHead
                  class="text-xs font-medium text-muted-foreground w-full"
                >
                  {{ t("settings.discovery.column.page") }}
                </TableHead>
                <TableHead
                  class="text-xs font-medium text-muted-foreground whitespace-nowrap"
                >
                  {{ t("settings.discovery.column.url") }}
                </TableHead>
                <TableHead
                  class="text-xs font-medium text-muted-foreground whitespace-nowrap"
                >
                  {{ t("settings.discovery.column.sitemap") }}
                </TableHead>
                <TableHead
                  class="text-xs font-medium text-muted-foreground whitespace-nowrap"
                >
                  {{ t("settings.discovery.column.reason") }}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <template v-if="isReportLoading">
                <TableRow
                  v-for="row in 4"
                  :key="`indexability-skeleton-${row}`"
                  class="border-b border-border last:border-0"
                >
                  <TableCell class="py-3">
                    <div class="h-3.5 w-28 animate-pulse rounded bg-muted/40" />
                  </TableCell>
                  <TableCell class="py-3">
                    <div class="h-3 w-24 animate-pulse rounded bg-muted/30" />
                  </TableCell>
                  <TableCell class="py-3">
                    <div class="h-3 w-8 animate-pulse rounded bg-muted/30" />
                  </TableCell>
                  <TableCell class="py-3">
                    <div
                      class="h-5 w-20 animate-pulse rounded-full bg-muted/30"
                    />
                  </TableCell>
                </TableRow>
              </template>
              <template v-else>
                <TableRow
                  v-for="row in indexabilityRows"
                  :key="row.pageId"
                  class="group cursor-pointer transition-colors hover:bg-muted/50 border-b border-border last:border-0"
                  @click="openIndexabilityRow(row.slug)"
                >
                  <TableCell class="py-3 min-w-0">
                    <span
                      class="text-sm font-medium text-foreground truncate block"
                    >
                      {{ row.title }}
                    </span>
                  </TableCell>
                  <TableCell
                    class="py-3 whitespace-nowrap text-xs text-muted-foreground"
                  >
                    {{ row.publicPath }}
                  </TableCell>
                  <TableCell
                    class="py-3 whitespace-nowrap text-xs text-foreground"
                  >
                    {{ row.inSitemap ? t("settings.discovery.yes") : t("settings.discovery.no") }}
                  </TableCell>
                  <TableCell class="py-3 whitespace-nowrap">
                    <Badge variant="outline" class="text-2xs">
                      {{ row.exclusionReason }}
                    </Badge>
                  </TableCell>
                </TableRow>
              </template>
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
      </div>
    </div>
  </div>
</template>
