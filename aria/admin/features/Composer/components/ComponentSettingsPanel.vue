<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { actions } from "astro:actions";
import { z } from "zod";
import { useStudioI18n } from "@/i18n";
import { studioIcons } from "@/lib/icons";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { BuilderNode, ComponentDSL } from "../../../../lib/types/nodes";
import type { ComponentSettingsUsageNode } from "../composables/componentSettingsActionResults";
import {
  unwrapComponentSettingsExportResult,
  unwrapComponentSettingsUsageResult,
} from "../composables/componentSettingsActionResults";
import { parseSaveActionData } from "../../../composables/saveActionResults";
import { useBuilderData } from "../../../composables/useBuilderData";

const COMPONENT_CATEGORIES = [
  "custom",
  "content",
  "marketing",
  "navigation",
  "forms",
  "media",
  "pricing",
  "social",
] as const;

interface Props {
  component: ComponentDSL | null;
  componentSlug?: string;
  blocks: BuilderNode[];
}

interface UsagePageItem {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly instances: number;
}

const props = defineProps<Props>();
const { t } = useStudioI18n();

const emit = defineEmits<{
  componentSaved: [component: ComponentDSL];
}>();

const { refreshComponents } = useBuilderData();

const isInfoOpen = ref(true);
const isUsageOpen = ref(true);
const isCodeOpen = ref(true);
const isSaving = ref(false);
const isLoadingUsage = ref(false);
const isLoadingCode = ref(false);
const error = ref<string | null>(null);
const codeOutput = ref("");
const usagePages = ref<UsagePageItem[]>([]);
const usageLayoutCount = ref(0);

const draftName = ref("");
const draftDescription = ref("");
const draftCategory = ref<string>(COMPONENT_CATEGORIES[0]);

const categoryOptions = computed(() => {
  const currentCategory = props.component?.category?.trim();
  if (
    currentCategory &&
    !COMPONENT_CATEGORIES.includes(
      currentCategory as (typeof COMPONENT_CATEGORIES)[number],
    )
  ) {
    return [currentCategory, ...COMPONENT_CATEGORIES];
  }

  return [...COMPONENT_CATEGORIES];
});

function categoryLabel(category: string): string {
  const key = `composer.componentSettings.category.${category}` as const;
  return t(key);
}

function createComponentSettingsSchema() {
  return z.object({
    name: z.string().trim().min(1, t("composer.componentSettings.nameRequired")).max(80),
    description: z.string().max(280).optional(),
    category: z.string().trim().min(1, t("composer.componentSettings.categoryRequired")).max(40),
  });
}

const canEdit = computed(() =>
  Boolean(props.component?.id || props.componentSlug),
);

watch(
  () => props.component,
  (component) => {
    draftName.value = component?.name || component?.id || "";
    draftDescription.value = component?.description || "";
    draftCategory.value =
      component?.category?.trim() || COMPONENT_CATEGORIES[0];
    error.value = null;
  },
  { immediate: true },
);

function countComponentRefs(
  nodes: ComponentSettingsUsageNode[],
  componentId: string,
): number {
  let count = 0;

  for (const node of nodes) {
    if (node.componentRef === componentId) {
      count += 1;
    }

    if (node.children?.length) {
      count += countComponentRefs(node.children, componentId);
    }
  }

  return count;
}

async function loadUsage(): Promise<void> {
  if (!props.component?.id) {
    usagePages.value = [];
    usageLayoutCount.value = 0;
    return;
  }

  isLoadingUsage.value = true;

  try {
    const { data, error: initError } = await actions.init();

    const parsed = unwrapComponentSettingsUsageResult(
      {
        data,
        error: initError,
      },
      "Invalid usage data from init action",
      {
        source: "ComponentSettingsPanel.loadUsage",
        componentId: props.component.id,
      },
    );
    if (!parsed.success) {
      throw new Error(parsed.error);
    }

    const nextPages = parsed.data.pages
      .map((page) => {
        const instances = countComponentRefs(
          page.nodes ?? [],
          props.component!.id,
        );

        return {
          id: page.id,
          slug: page.slug || page.id,
          title: page.title || page.slug || page.id,
          instances,
        } satisfies UsagePageItem;
      })
      .filter((page) => page.instances > 0)
      .sort((left, right) => right.instances - left.instances);

    usagePages.value = nextPages;
    usageLayoutCount.value = parsed.data.layouts.filter((layout) => {
      return countComponentRefs(layout.nodes ?? [], props.component!.id) > 0;
    }).length;
  } catch (loadError) {
    console.error("[ComponentSettingsPanel] Failed to load usage", loadError);
    usagePages.value = [];
    usageLayoutCount.value = 0;
  } finally {
    isLoadingUsage.value = false;
  }
}

async function loadCodePreview(): Promise<void> {
  if (!props.component?.id) {
    codeOutput.value = "// Component export unavailable";
    return;
  }

  isLoadingCode.value = true;

  try {
    const result = await actions.importExport.exportItem({
      type: "component",
      id: props.component.id,
    });

    const parsed = unwrapComponentSettingsExportResult(
      result,
      "Failed to generate component code",
      {
        source: "ComponentSettingsPanel.loadCodePreview",
        componentId: props.component.id,
      },
    );
    if (!parsed.success) {
      throw new Error(parsed.error);
    }

    codeOutput.value = parsed.data.content || "// No export output generated";
  } catch (loadError) {
    console.error(
      "[ComponentSettingsPanel] Failed to load code preview",
      loadError,
    );
    codeOutput.value = "// Failed to generate component code";
  } finally {
    isLoadingCode.value = false;
  }
}

async function handleCopyCode(): Promise<void> {
  if (!codeOutput.value.trim()) return;
  await navigator.clipboard.writeText(codeOutput.value);
  toast.success(t("composer.componentSettings.codeCopied"));
}

async function handleSave(): Promise<void> {
  if (!props.component || isSaving.value) return;

  const parsed = createComponentSettingsSchema().safeParse({
    name: draftName.value,
    description: draftDescription.value,
    category: draftCategory.value,
  });

  if (!parsed.success) {
    error.value =
      parsed.error.issues[0]?.message || t("composer.componentSettings.invalid");
    return;
  }

  isSaving.value = true;
  error.value = null;

  try {
    if (!props.component.version) {
      throw new Error("Reload this component before saving its settings");
    }
    const nextComponent: ComponentDSL = {
      ...props.component,
      name: parsed.data.name,
      description: parsed.data.description?.trim() || undefined,
      category: parsed.data.category,
      nodes: props.blocks,
      updatedAt: new Date().toISOString(),
    };

    const result = await actions.saveComponent({
      id: props.component.id,
      blocks: props.blocks,
      name: nextComponent.name,
      description: nextComponent.description,
      category: nextComponent.category,
      expectedVersion: props.component.version,
    });

    if (result.error) {
      throw new Error(
        result.error.message || t("composer.componentSettings.saveFailed"),
      );
    }

    const saveData = parseSaveActionData(result.data, "component");

    emit("componentSaved", {
      ...nextComponent,
      version: saveData.version,
    });
    await refreshComponents();
    await loadCodePreview();
    toast.success(t("composer.componentSettings.saved"));
  } catch (saveError) {
    error.value =
      saveError instanceof Error
        ? saveError.message
        : t("composer.componentSettings.saveFailed");
  } finally {
    isSaving.value = false;
  }
}

watch(
  () => props.component?.id,
  async () => {
    await Promise.all([loadUsage(), loadCodePreview()]);
  },
  { immediate: true },
);
</script>

<template>
  <div class="space-y-4 px-2 pb-4 pt-1">
    <div class="px-1">
      <p
        class="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/35"
      >
        Component Settings
      </p>
    </div>

    <div
      v-if="!canEdit"
      class="rounded-lg border border-dashed border-border/50 bg-background/30 px-3 py-4 text-sm text-foreground/55"
    >
      Component settings are available when editing a component.
    </div>

    <template v-else>
      <Collapsible v-model:open="isInfoOpen" class="space-y-2">
        <CollapsibleTrigger as-child>
          <button
            type="button"
            class="flex w-full items-center justify-between rounded-lg border border-border/50 bg-background/35 px-3 py-2 text-left"
          >
            <span>
              <span
                class="block text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/35"
              >
                {{ t("composer.componentSettings.info") }}
              </span>
              <span class="mt-1 block text-xs text-foreground/45">
                {{ t("composer.componentSettings.infoDescription") }}
              </span>
            </span>
            <span
              :class="[
                [studioIcons.chevronDown, 'size-4 text-foreground/40 transition-transform'],
                isInfoOpen ? 'rotate-180' : '',
              ]"
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div
            class="rounded-lg border border-border/50 bg-background/35 p-3 space-y-3"
          >
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-foreground/70">{{ t("composer.componentSettings.name") }}</label>
              <Input
                v-model="draftName"
                placeholder="Testimonials"
                class="h-9 rounded-lg border-border/50 bg-background/70"
              />
            </div>

            <div class="space-y-1.5">
              <label class="text-xs font-medium text-foreground/70"
                >{{ t("composer.componentSettings.category") }}</label
              >
              <Select v-model="draftCategory">
                <SelectTrigger
                  class="h-9 rounded-lg border-border/50 bg-background/70 text-xs"
                >
                  <SelectValue :placeholder="t('composer.componentSettings.selectCategory')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="category in categoryOptions"
                    :key="category"
                    :value="category"
                  >
                    {{ categoryLabel(category) }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div class="space-y-1.5">
              <label class="text-xs font-medium text-foreground/70"
                >{{ t("composer.componentSettings.description") }}</label
              >
              <Textarea
                v-model="draftDescription"
                rows="4"
                :placeholder="t('composer.componentSettings.descriptionPlaceholder')"
                class="rounded-lg border-border/50 bg-background/70"
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible v-model:open="isUsageOpen" class="space-y-2">
        <CollapsibleTrigger as-child>
          <button
            type="button"
            class="flex w-full items-center justify-between rounded-lg border border-border/50 bg-background/35 px-3 py-2 text-left"
          >
            <span>
              <span
                class="block text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/35"
              >
                {{ t("composer.componentSettings.usage") }}
              </span>
              <span class="mt-1 block text-xs text-foreground/45">
                {{ t("composer.componentSettings.usageDescription") }}
              </span>
            </span>
            <span
              :class="[
                [studioIcons.chevronDown, 'size-4 text-foreground/40 transition-transform'],
                isUsageOpen ? 'rotate-180' : '',
              ]"
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div
            class="rounded-lg border border-border/50 bg-background/35 p-3 space-y-3"
          >
            <div v-if="isLoadingUsage" class="text-xs text-foreground/45">
              {{ t("composer.componentSettings.loadingUsage") }}
            </div>

            <div v-else-if="usagePages.length === 0" class="space-y-2">
              <div class="text-sm text-foreground">
                {{ t("composer.componentSettings.noUsage") }}
              </div>
              <div
                v-if="usageLayoutCount > 0"
                class="text-xs text-foreground/45"
              >
                {{ t("composer.componentSettings.layoutReferences", { count: usageLayoutCount }) }}
              </div>
            </div>

            <div v-else class="space-y-2">
              <div
                v-for="page in usagePages"
                :key="page.id"
                class="flex items-center justify-between rounded-lg border border-border/50 bg-background/70 px-3 py-2"
              >
                <div class="min-w-0">
                  <div class="truncate text-sm text-foreground">
                    {{ page.title }}
                  </div>
                  <div class="text-[11px] text-foreground/45">
                    /{{ page.slug === "index" ? "" : page.slug }}
                  </div>
                </div>
                <div
                  class="rounded-full border border-border/50 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-foreground/45"
                >
                  {{ t("composer.componentSettings.instances", { count: page.instances }) }}
                </div>
              </div>

              <div
                v-if="usageLayoutCount > 0"
                class="text-xs text-foreground/45"
              >
                {{ t("composer.componentSettings.layoutReferences", { count: usageLayoutCount }) }}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible v-model:open="isCodeOpen" class="space-y-2">
        <CollapsibleTrigger as-child>
          <button
            type="button"
            class="flex w-full items-center justify-between rounded-lg border border-border/50 bg-background/35 px-3 py-2 text-left"
          >
            <span>
              <span
                class="block text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/35"
              >
                {{ t("composer.componentSettings.codePreview") }}
              </span>
              <span class="mt-1 block text-xs text-foreground/45">
                {{ t("composer.componentSettings.codePreviewDescription") }}
              </span>
            </span>
            <span
              :class="[
                [studioIcons.chevronDown, 'size-4 text-foreground/40 transition-transform'],
                isCodeOpen ? 'rotate-180' : '',
              ]"
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div
            class="rounded-lg border border-border/50 bg-background/35 p-3 space-y-3"
          >
            <div class="flex items-center justify-between">
              <span
                class="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/35"
              >
                {{ t("composer.componentSettings.astroExport") }}
              </span>
              <Button
                variant="ghost"
                size="sm"
                class="h-7 rounded-md px-2 text-[11px]"
                @click="handleCopyCode"
              >
                {{ t("common.copy") }}
              </Button>
            </div>

            <pre
              class="max-h-72 overflow-auto rounded-lg border border-dashed border-border bg-background/70 p-3 text-[11px] leading-5 text-foreground/85 whitespace-pre-wrap"
              >{{ isLoadingCode ? t("composer.componentSettings.generatingCode") : codeOutput }}</pre
            >
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div class="rounded-lg border border-border/50 bg-background/35 p-3">
        <div class="space-y-3">
          <div class="min-w-0">
            <div class="text-xs font-medium text-foreground">
              {{ t("composer.componentSettings.saveTitle") }}
            </div>
            <p class="mt-1 text-[11px] leading-4 text-foreground/45">
              {{ t("composer.componentSettings.saveDescription") }}
            </p>
            <div v-if="error" class="mt-2 text-xs text-destructive">
              {{ error }}
            </div>
          </div>

          <Button
            size="sm"
            class="h-9 w-full rounded-lg"
            :disabled="isSaving"
            @click="handleSave"
          >
            {{ isSaving ? t("common.saving") : t("composer.componentSettings.saveAction") }}
          </Button>
        </div>
      </div>
    </template>
  </div>
</template>
