<script setup lang="ts">
import { computed, nextTick, onActivated, onMounted, ref, watch } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useCapabilities } from "@/composables/useCapabilities";
import { useBuilderData } from "@/composables/useBuilderData";
import { useStudioI18n } from "@/i18n";
import {
  parseRedirectTargetsPayload,
  parseRedirectListPayload,
  parseRedirectRulePayload,
  parseImportRedirectsCsvPayload,
} from "@/composables/redirectsActionResults";
import { buildStudioPagePathMap } from "@/lib/pages/publicPaths";
import type { RedirectRule, RedirectTarget } from "@/lib/redirects/schemas";
import { studioIcons } from "@/lib/icons";
import SettingsReadOnlyNotice from "./SettingsReadOnlyNotice.vue";
import { useSettingsDialog } from "../composables/useSettingsDialog";
import { useSlugChangeRedirect } from "../composables/useSlugChangeRedirect";

const { hasCapability } = useCapabilities();
const { t } = useStudioI18n();
const canManageRedirects = computed(() => hasCapability("manageRedirects"));
const { pages: builderPages, refreshPagesNow } = useBuilderData();
const settingsDialog = useSettingsDialog();
const { redirectsRevision } = useSlugChangeRedirect();

const isLoading = ref(false);
const isLoadingTargets = ref(false);
const redirects = ref<RedirectRule[]>([]);
const redirectTargets = ref<RedirectTarget[]>([]);
const showForm = ref(false);
const showImport = ref(false);
const targetPickerOpen = ref(false);
const editingId = ref<string | null>(null);
const fromPath = ref("");
const toPath = ref("");
const statusCode = ref<301 | 302>(301);
const enabled = ref(true);
const csvImport = ref("");
const togglingId = ref<string | null>(null);
const settingsActionsTarget = ref<Element | null>(null);
const formServerErrors = ref<{
  fromPath?: string;
  toPath?: string;
  general?: string;
}>({});

type RedirectTargetGroup = {
  key: string;
  heading: string;
  targets: RedirectTarget[];
};

async function resolveSettingsActionsTarget(): Promise<void> {
  await nextTick();
  settingsActionsTarget.value = document.querySelector("#settings-tab-actions");
}

function normalizeRedirectInputPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function isUnsafeRedirectDestination(path: string): boolean {
  return (
    /^https?:\/\//i.test(path) ||
    path.startsWith("//") ||
    /^(javascript|data):/i.test(path)
  );
}

function isProtectedRedirectPath(path: string): boolean {
  const protectedPrefixes = [
    "/admin",
    "/_actions",
    "/uploads",
    "/_astro",
    "/robots.txt",
    "/sitemap.xml",
    "/llms.txt",
    "/llms-full.txt",
    "/feed.xml",
    "/favicon.ico",
    "/styles/",
  ];
  return protectedPrefixes.some(
    (prefix) => path === prefix || path.startsWith(prefix),
  );
}

const builderRedirectTargets = computed<RedirectTarget[]>(() => {
  const pathMap = buildStudioPagePathMap(
    builderPages.value.map((page) => ({
      slug: page.slug,
      parent: page.parent,
    })),
  );

  return builderPages.value
    .map((page) => {
      const path = pathMap.get(page.slug);
      if (!path) return null;
      return {
        id: `page:${page.id}`,
        kind: "page" as const,
        title: page.title || page.slug,
        path,
        status: page.status,
      };
    })
    .filter((target): target is RedirectTarget => target != null)
    .sort((a, b) => a.path.localeCompare(b.path));
});

const availableRedirectTargets = computed(() =>
  redirectTargets.value.length > 0
    ? redirectTargets.value
    : builderRedirectTargets.value,
);

const redirectTargetGroups = computed<RedirectTargetGroup[]>(() => {
  const pages = availableRedirectTargets.value.filter(
    (target) => target.kind === "page",
  );
  const entriesByCollection = new Map<string, RedirectTargetGroup>();

  for (const target of availableRedirectTargets.value) {
    if (target.kind !== "entry") continue;
    const key = target.collectionId ?? "entries";
    const existing = entriesByCollection.get(key);
    if (existing) {
      existing.targets.push(target);
      continue;
    }
    entriesByCollection.set(key, {
      key: `collection:${key}`,
      heading: target.collectionLabel ?? t("settings.redirects.entries"),
      targets: [target],
    });
  }

  return [
    ...(pages.length > 0
      ? [
          {
            key: "pages",
            heading: t("settings.redirects.pages"),
            targets: pages,
          },
        ]
      : []),
    ...[...entriesByCollection.values()].sort((left, right) =>
      left.heading.localeCompare(right.heading),
    ),
  ];
});

const targetPathSet = computed(
  () => new Set(availableRedirectTargets.value.map((target) => target.path)),
);

const normalizedFromPath = computed(() =>
  normalizeRedirectInputPath(fromPath.value),
);

const normalizedToPath = computed(() =>
  normalizeRedirectInputPath(toPath.value),
);

const clientFormErrors = computed(() => {
  const errors: { fromPath?: string; toPath?: string; general?: string } = {};
  const from = normalizedFromPath.value;
  const to = normalizedToPath.value;

  if (from && isProtectedRedirectPath(from)) {
    errors.fromPath = t("settings.redirects.validation.sourceProtected");
  } else if (from && targetPathSet.value.has(from)) {
    errors.fromPath = t("settings.redirects.validation.sourceLivePage");
  }

  if (to) {
    if (isUnsafeRedirectDestination(toPath.value.trim())) {
      errors.toPath = t("settings.redirects.validation.externalDestination");
    } else if (isProtectedRedirectPath(to)) {
      errors.toPath = t("settings.redirects.validation.destinationProtected");
    } else if (from && from === to) {
      errors.toPath = t("settings.redirects.validation.destinationDifferent");
    } else if (to !== "/" && !targetPathSet.value.has(to)) {
      errors.toPath = t("settings.redirects.validation.destinationUnavailable");
    }
  }

  return errors;
});

const visibleFormErrors = computed(() => ({
  ...clientFormErrors.value,
  ...formServerErrors.value,
}));

const canSaveRule = computed(
  () =>
    fromPath.value.trim().length > 0 &&
    toPath.value.trim().length > 0 &&
    !visibleFormErrors.value.fromPath &&
    !visibleFormErrors.value.toPath &&
    !visibleFormErrors.value.general,
);

function clearFormServerErrors(): void {
  formServerErrors.value = {};
}

function applyServerValidationError(message: string): boolean {
  if (
    message.includes("Destination path") ||
    message.includes("destination") ||
    message.includes("External")
  ) {
    formServerErrors.value = { toPath: message };
    return true;
  }
  if (
    message.includes("This path") ||
    message.includes("redirect already exists")
  ) {
    formServerErrors.value = { fromPath: message };
    return true;
  }
  if (message.includes("loop")) {
    formServerErrors.value = { general: message };
    return true;
  }
  return false;
}

async function loadRedirectTargets(): Promise<void> {
  if (!canManageRedirects.value || isLoadingTargets.value) return;
  isLoadingTargets.value = true;
  try {
    if (builderPages.value.length === 0) {
      await refreshPagesNow();
    }
    const { data, error } = await actions.redirects.listTargets();
    if (error) throw new Error(error.message);
    redirectTargets.value = parseRedirectTargetsPayload(data).targets;
  } catch (error) {
    if (builderRedirectTargets.value.length === 0) {
      toast.error(
        error instanceof Error
          ? t("settings.redirects.loadTargetsFailedWithMessage", {
              message: error.message,
            })
          : t("settings.redirects.loadTargetsFailed"),
      );
    }
  } finally {
    isLoadingTargets.value = false;
  }
}

function selectRedirectTarget(target: RedirectTarget): void {
  toPath.value = target.path;
  targetPickerOpen.value = false;
  clearFormServerErrors();
}

async function importCsvRules(): Promise<void> {
  if (!canManageRedirects.value || csvImport.value.trim().length === 0) return;
  try {
    const { data, error } = await actions.redirects.importCsv({
      csv: csvImport.value,
      replaceExisting: false,
    });
    if (error) throw new Error(error.message);
    const result = parseImportRedirectsCsvPayload(data);
    await loadRedirects();
    toast.success(
      t("settings.redirects.imported", { count: String(result.imported) }),
    );
    if (result.errors.length > 0) {
      toast.warning(result.errors.slice(0, 3).join(" "));
    }
    csvImport.value = "";
    showImport.value = false;
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : t("settings.redirects.importFailed"),
    );
  }
}

async function loadRedirects(): Promise<void> {
  const { data, error } = await actions.redirects.list({
    includeDisabled: true,
  });
  if (error) {
    throw new Error(error.message ?? t("settings.redirects.loadFailed"));
  }
  redirects.value = parseRedirectListPayload(data).redirects;
}

async function hydrateRedirects(): Promise<void> {
  if (isLoading.value) return;
  isLoading.value = true;
  try {
    await loadRedirects();
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : t("settings.redirects.loadFailed"),
    );
  } finally {
    isLoading.value = false;
  }
}

function resetForm(): void {
  editingId.value = null;
  fromPath.value = "";
  toPath.value = "";
  statusCode.value = 301;
  enabled.value = true;
  showForm.value = false;
  targetPickerOpen.value = false;
  clearFormServerErrors();
}

function toggleImport(): void {
  showImport.value = !showImport.value;
  if (showImport.value) {
    resetForm();
  }
}

function openAddForm(): void {
  resetForm();
  showImport.value = false;
  showForm.value = true;
}

function editRule(rule: RedirectRule): void {
  showImport.value = false;
  clearFormServerErrors();
  editingId.value = rule.id;
  fromPath.value = rule.fromPath;
  toPath.value = rule.toPath;
  statusCode.value = rule.statusCode;
  enabled.value = rule.enabled;
  showForm.value = true;
}

async function setRuleEnabled(
  rule: RedirectRule,
  nextEnabled: boolean,
): Promise<void> {
  if (!canManageRedirects.value || rule.enabled === nextEnabled) return;

  const index = redirects.value.findIndex((entry) => entry.id === rule.id);
  if (index < 0) return;

  const previous = redirects.value[index];
  redirects.value[index] = { ...previous, enabled: nextEnabled };
  togglingId.value = rule.id;

  try {
    const { data, error } = await actions.redirects.update({
      id: rule.id,
      enabled: nextEnabled,
    });
    if (error) throw new Error(error.message);
    redirects.value[index] = parseRedirectRulePayload(data);
  } catch (error) {
    redirects.value[index] = previous;
    toast.error(
      error instanceof Error
        ? t("settings.redirects.updateFailedWithMessage", {
            message: error.message,
          })
        : t("settings.redirects.updateFailed"),
    );
  } finally {
    togglingId.value = null;
  }
}

async function saveRule(): Promise<void> {
  if (!canManageRedirects.value) return;
  clearFormServerErrors();
  if (!canSaveRule.value) return;
  try {
    if (editingId.value) {
      const { data, error } = await actions.redirects.update({
        id: editingId.value,
        fromPath: fromPath.value,
        toPath: toPath.value,
        statusCode: statusCode.value,
        enabled: enabled.value,
      });
      if (error) throw new Error(error.message);
      parseRedirectRulePayload(data);
    } else {
      const { data, error } = await actions.redirects.create({
        fromPath: fromPath.value,
        toPath: toPath.value,
        statusCode: statusCode.value,
        enabled: true,
      });
      if (error) throw new Error(error.message);
      parseRedirectRulePayload(data);
    }
    resetForm();
    await loadRedirects();
    toast.success(t("settings.redirects.saved"));
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : t("settings.redirects.saveFailed");
    if (!applyServerValidationError(message)) {
      toast.error(t("settings.redirects.saveFailedWithMessage", { message }));
    }
  }
}

async function deleteRule(id: string): Promise<void> {
  if (!canManageRedirects.value) return;
  const { error } = await actions.redirects.delete({ id });
  if (error) {
    toast.error(error.message ?? t("settings.redirects.deleteFailed"));
    return;
  }
  await loadRedirects();
  toast.success(t("settings.redirects.deleted"));
}

async function flattenRule(id: string): Promise<void> {
  if (!canManageRedirects.value) return;
  try {
    const { data, error } = await actions.redirects.flattenChain({ id });
    if (error) throw new Error(error.message);
    parseRedirectRulePayload(data);
    await loadRedirects();
    toast.success(t("settings.redirects.flattened"));
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : t("settings.redirects.flattenFailed"),
    );
  }
}

onMounted(() => {
  void resolveSettingsActionsTarget();
  void hydrateRedirects();
  void loadRedirectTargets();
});

onActivated(() => {
  void hydrateRedirects();
});

watch(
  () => settingsDialog.activeTab.value,
  (tab) => {
    if (tab === "redirects") {
      void hydrateRedirects();
      void loadRedirectTargets();
    }
  },
);

watch([fromPath, toPath, statusCode, enabled], () => {
  clearFormServerErrors();
});

watch(redirectsRevision, () => {
  if (settingsDialog.activeTab.value === "redirects") {
    void hydrateRedirects();
  }
});
</script>

<template>
  <Teleport
    :to="settingsActionsTarget ?? undefined"
    :disabled="!settingsActionsTarget"
  >
    <div v-if="canManageRedirects" class="flex items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        :disabled="isLoading"
        @click="toggleImport"
      >
        <span
          :class="[
            showImport ? studioIcons.chevronDown : studioIcons.upload,
            'mr-1.5 size-3.5 transition-transform',
            showImport ? 'rotate-180' : '',
          ]"
        />
        {{ t("settings.redirects.importCsv") }}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        :disabled="isLoading"
        @click="openAddForm"
      >
        <span :class="[studioIcons.plus, 'mr-1.5 size-3.5']" />
        {{ t("settings.redirects.add") }}
      </Button>
    </div>
  </Teleport>

  <div
    class="min-w-0 space-y-0 p-0 page-card-enter z-10 bg-background"
    role="form"
    :aria-label="t('settings.redirects.formLabel')"
  >
    <div class="px-10 py-7">
      <div class="max-w-5xl space-y-7">
        <SettingsReadOnlyNotice v-if="!canManageRedirects" />

        <section
          v-if="showImport && canManageRedirects"
          class="space-y-2 pt-0 pb-4"
        >
          <div class="flex items-center justify-between gap-3">
            <h4
              class="m-0 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground"
            >
              {{ t("settings.redirects.importCsv") }}
            </h4>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              class="h-9"
              @click="showImport = false"
            >
              {{ t("common.cancel") }}
            </Button>
          </div>
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start">
            <textarea
              v-model="csvImport"
              rows="4"
              class="min-h-[6.5rem] flex-1 rounded-md border border-input bg-input px-3 py-2 font-mono text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-ring"
              placeholder="/old-page,/new-page,301"
            />
            <div class="flex shrink-0 flex-col gap-2 sm:w-32">
              <Button
                size="sm"
                class="h-9"
                :disabled="isLoading || csvImport.trim().length === 0"
                @click="importCsvRules"
              >
                {{ t("settings.redirects.import") }}
              </Button>
              <p class="m-0 text-2xs leading-relaxed text-muted-foreground/70">
                {{ t("settings.redirects.csvHint") }}
              </p>
            </div>
          </div>
        </section>

        <section
          v-if="showForm && canManageRedirects"
          class="space-y-5 border-y border-border/70 py-5"
        >
          <h4
            class="m-0 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground"
          >
            {{
              editingId
                ? t("settings.redirects.edit")
                : t("settings.redirects.add")
            }}
          </h4>
          <p
            v-if="visibleFormErrors.general"
            class="m-0 text-xs text-destructive"
          >
            {{ visibleFormErrors.general }}
          </p>
          <div class="grid gap-4 lg:grid-cols-2">
            <div class="min-w-0 space-y-2">
              <Label
                for="redirect-from-path"
                class="text-xs text-muted-foreground"
              >
                {{ t("settings.redirects.source") }}
              </Label>
              <Input
                id="redirect-from-path"
                v-model="fromPath"
                placeholder="/from"
                class="h-9 min-w-0 bg-input font-mono text-xs"
                :class="visibleFormErrors.fromPath ? 'border-destructive' : ''"
                :aria-invalid="Boolean(visibleFormErrors.fromPath)"
              />
              <p
                v-if="visibleFormErrors.fromPath"
                class="m-0 text-2xs leading-relaxed text-destructive"
              >
                {{ visibleFormErrors.fromPath }}
              </p>
            </div>
            <div class="min-w-0 space-y-2">
              <Label
                for="redirect-to-path"
                class="text-xs text-muted-foreground"
              >
                {{ t("settings.redirects.destination") }}
              </Label>
              <div class="flex min-w-0 gap-2">
                <Input
                  id="redirect-to-path"
                  v-model="toPath"
                  placeholder="/to"
                  class="h-9 min-w-0 flex-1 bg-input font-mono text-xs"
                  :class="visibleFormErrors.toPath ? 'border-destructive' : ''"
                  :aria-invalid="Boolean(visibleFormErrors.toPath)"
                />
                <Popover v-model:open="targetPickerOpen">
                  <PopoverTrigger as-child>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      class="h-9 shrink-0"
                      :disabled="isLoadingTargets"
                    >
                      <span :class="[studioIcons.link, 'mr-1.5 size-3.5']" />
                      {{ t("settings.redirects.browse") }}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" class="w-80 p-0">
                    <Command>
                      <CommandInput
                        :placeholder="t('settings.redirects.searchTargets')"
                      />
                      <CommandList class="max-h-72">
                        <CommandEmpty>
                          {{ t("settings.redirects.noAvailableTargets") }}
                        </CommandEmpty>
                        <CommandGroup
                          v-for="group in redirectTargetGroups"
                          :key="group.key"
                          :heading="group.heading"
                        >
                          <CommandItem
                            v-for="target in group.targets"
                            :key="target.id"
                            :value="`${target.title} ${target.path} ${target.collectionLabel ?? ''} ${target.locale ?? ''}`"
                            class="flex items-center gap-2"
                            @select="selectRedirectTarget(target)"
                          >
                            <span
                              :class="[
                                target.kind === 'entry'
                                  ? studioIcons.collections
                                  : target.path === '/'
                                    ? studioIcons.home
                                    : studioIcons.page,
                                'size-3.5 shrink-0 text-muted-foreground',
                              ]"
                            />
                            <span class="min-w-0 flex-1 truncate text-xs">
                              {{ target.title }}
                            </span>
                            <span
                              class="shrink-0 font-mono text-2xs text-muted-foreground/70"
                            >
                              {{ target.path }}
                            </span>
                            <span
                              v-if="target.locale"
                              class="shrink-0 text-2xs text-muted-foreground/70"
                            >
                              {{ target.locale }}
                            </span>
                            <span
                              v-if="target.path === normalizedToPath"
                              :class="[
                                studioIcons.checkLinear,
                                'size-3.5 shrink-0 text-primary',
                              ]"
                            />
                          </CommandItem>
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <p
                v-if="visibleFormErrors.toPath"
                class="m-0 text-2xs leading-relaxed text-destructive"
              >
                {{ visibleFormErrors.toPath }}
              </p>
            </div>
          </div>

          <div
            class="flex flex-col gap-4 border-t border-border/70 pt-4 sm:flex-row sm:items-end sm:justify-between"
          >
            <div class="flex flex-wrap items-end gap-4">
              <div class="space-y-2">
                <Label class="text-xs text-muted-foreground">
                  {{ t("settings.redirects.status") }}
                </Label>
                <div
                  class="inline-flex h-9 overflow-hidden rounded-md border border-border/70 bg-input/30"
                  role="radiogroup"
                  :aria-label="t('settings.redirects.statusAria')"
                >
                  <button
                    type="button"
                    class="h-9 px-3 text-xs font-medium transition-colors hover:text-foreground"
                    :class="
                      statusCode === 301
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground'
                    "
                    role="radio"
                    :aria-checked="statusCode === 301"
                    @click="statusCode = 301"
                  >
                    {{ t("settings.redirects.permanent") }}
                  </button>
                  <button
                    type="button"
                    class="h-9 border-l border-border/70 px-3 text-xs font-medium transition-colors hover:text-foreground"
                    :class="
                      statusCode === 302
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground'
                    "
                    role="radio"
                    :aria-checked="statusCode === 302"
                    @click="statusCode = 302"
                  >
                    {{ t("settings.redirects.temporary") }}
                  </button>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2 sm:justify-end">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                class="h-9"
                @click="resetForm"
              >
                {{ t("common.cancel") }}
              </Button>
              <Button
                size="sm"
                class="h-9"
                :disabled="isLoading || !canSaveRule"
                @click="saveRule"
              >
                {{ t("common.save") }}
              </Button>
            </div>
          </div>
        </section>

        <section class="space-y-3">
          <h4
            class="m-0 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground"
          >
            {{ t("settings.redirects.rules") }}
          </h4>
          <div class="border-y border-border/70">
            <div
              class="hidden grid-cols-[minmax(0,1.25fr)_minmax(0,1.25fr)_4.5rem_5rem_minmax(11rem,auto)] gap-4 border-b border-border/70 py-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground lg:grid"
            >
              <span>{{ t("settings.redirects.from") }}</span>
              <span>{{ t("settings.redirects.to") }}</span>
              <span>{{ t("settings.redirects.code") }}</span>
              <span>{{ t("settings.redirects.active") }}</span>
              <span class="text-right">
                {{ canManageRedirects ? t("settings.redirects.actions") : "" }}
              </span>
            </div>

            <div
              v-if="isLoading && redirects.length === 0"
              class="py-8 text-center text-sm text-muted-foreground"
            >
              {{ t("settings.redirects.loading") }}
            </div>
            <div
              v-else-if="redirects.length === 0"
              class="py-8 text-center text-sm text-muted-foreground"
            >
              {{ t("settings.redirects.empty") }}
            </div>

            <div v-else class="divide-y divide-border/70">
              <article
                v-for="rule in redirects"
                :key="rule.id"
                class="grid gap-3 py-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1.25fr)_4.5rem_5rem_minmax(11rem,auto)] lg:items-center lg:gap-4"
              >
                <div class="min-w-0">
                  <p
                    class="mb-1 text-2xs uppercase tracking-[0.14em] text-muted-foreground lg:hidden"
                  >
                    {{ t("settings.redirects.from") }}
                  </p>
                  <p class="m-0 truncate font-mono text-xs text-foreground">
                    {{ rule.fromPath }}
                  </p>
                </div>
                <div class="min-w-0">
                  <p
                    class="mb-1 text-2xs uppercase tracking-[0.14em] text-muted-foreground lg:hidden"
                  >
                    {{ t("settings.redirects.to") }}
                  </p>
                  <p class="m-0 truncate font-mono text-xs text-foreground">
                    {{ rule.toPath }}
                  </p>
                </div>
                <div>
                  <p
                    class="mb-1 text-2xs uppercase tracking-[0.14em] text-muted-foreground lg:hidden"
                  >
                    {{ t("settings.redirects.code") }}
                  </p>
                  <p class="m-0 text-xs tabular-nums text-muted-foreground">
                    {{ rule.statusCode }}
                  </p>
                </div>
                <div>
                  <p
                    class="mb-1 text-2xs uppercase tracking-[0.14em] text-muted-foreground lg:hidden"
                  >
                    {{ t("settings.redirects.active") }}
                  </p>
                  <Switch
                    v-if="canManageRedirects"
                    :model-value="rule.enabled"
                    :disabled="togglingId === rule.id"
                    @update:model-value="
                      (value: boolean) => setRuleEnabled(rule, value)
                    "
                  />
                  <span v-else class="text-xs text-muted-foreground">
                    {{ rule.enabled ? t("common.yes") : t("common.no") }}
                  </span>
                </div>
                <div
                  v-if="canManageRedirects"
                  class="flex flex-wrap items-center gap-1.5 lg:justify-end"
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-8 px-2"
                    :aria-label="
                      t('settings.redirects.editAria', { path: rule.fromPath })
                    "
                    @click="editRule(rule)"
                  >
                    <span :class="[studioIcons.edit, 'size-3.5']" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-8"
                    @click="flattenRule(rule.id)"
                  >
                    {{ t("settings.redirects.flatten") }}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-8 w-8 p-0!"
                    :aria-label="
                      t('settings.redirects.deleteAria', {
                        path: rule.fromPath,
                      })
                    "
                    @click="deleteRule(rule.id)"
                  >
                    <span :class="[studioIcons.trash, 'size-3.5']" />
                  </Button>
                </div>
              </article>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
