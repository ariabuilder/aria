<script setup lang="ts">
import { nextTick, ref } from "vue";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import ErrorBanner from "@/features/Studio/core/components/ErrorBanner.vue";
import type { PageDetailError } from "@/lib/errors/pageDetailErrors";
import type { PageAnalytics } from "@/lib/blocks/nodeAnalytics";
import { studioIcons } from "@/lib/icons";
import PageDetailOverviewStatsGrid from "./PageDetailOverviewStatsGrid.vue";
import { useStudioI18n } from "@/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

defineProps<{
  currentError: PageDetailError | null;
  analytics: PageAnalytics | null;
  seoScore: number;
  isLoading: boolean;
  isLoaded: boolean;
  pageSlug?: string;
  pagePath?: string;
  status: "draft" | "published" | "scheduled" | "archived";
  statusLabel: string;
  statusDescription: string;
  statusDotClass: string;
  statusSurfaceClass: string;
  currentLayout?: string;
  currentParent?: string;
  currentVisibility?: "public" | "private" | "unlisted";
  isSaving?: boolean;
  availableLayouts?: Array<{ slug: string; name: string }>;
  availableParents?: Array<{ slug: string; title: string }>;
  editorName?: string;
  lastEdited?: string;
}>();

const emit = defineEmits<{
  dismissError: [];
  retryLoad: [];
  updateLayout: [layout: string];
  updateParent: [parent: string];
  updateVisibility: [visibility: "public" | "private" | "unlisted"];
}>();

const title = defineModel<string>("title", { default: "" });
const description = defineModel<string>("description", { default: "" });
const slug = defineModel<string>("slug", { default: "" });
const { t } = useStudioI18n();

const isEditingPath = ref(false);
const editingSlug = ref("");
const pathInputRef = ref<HTMLInputElement | null>(null);

function startPathEdit(): void {
  editingSlug.value = slug.value || "";
  isEditingPath.value = true;
  nextTick(() => {
    pathInputRef.value?.focus();
    pathInputRef.value?.select();
  });
}

function confirmPathEdit(): void {
  const trimmed = editingSlug.value.trim().replace(/^\/+/, "");
  if (trimmed) {
    slug.value = trimmed;
  }
  isEditingPath.value = false;
}

function cancelPathEdit(): void {
  isEditingPath.value = false;
}

async function copyPath(path: string | undefined): Promise<void> {
  try {
    await navigator.clipboard.writeText(path || "/");
    toast.success(t("pages.overview.pathCopied"));
  } catch {
    toast.error(t("pages.overview.copyPathFailed"));
  }
}

const NONE_VALUE = "__none";
const detailLabelClass = "text-sm! text-muted-foreground";
</script>

<template>
  <div class="space-y-8">
    <ErrorBanner
      :error="currentError"
      @dismiss="emit('dismissError')"
      @retry="emit('retryLoad')"
    />

    <div class="max-w-4xl space-y-8">
      <PageDetailOverviewStatsGrid
        :page-slug="pageSlug"
        :status="status"
        :status-label="statusLabel"
        :status-description="statusDescription"
        :status-dot-class="statusDotClass"
        :status-surface-class="statusSurfaceClass"
        :editor-name="editorName"
        :last-edited="lastEdited"
        :seo-score="seoScore"
      />

      <section class="space-y-4">
        <h2 class="m-0 text-sm font-medium text-muted-foreground">
          {{ t("pages.overview.title") }}
        </h2>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-1.5">
            <Label :class="detailLabelClass">
              {{ t("cms.title") }}
            </Label>
            <Input
              v-model="title"
              class="h-9"
              :placeholder="t('pages.overview.titlePlaceholder')"
              :disabled="isSaving"
            />
          </div>

          <div class="space-y-1.5">
            <Label :class="detailLabelClass">
              {{ t("pages.overview.path") }}
            </Label>
            <div
              class="group/path flex h-9 items-stretch overflow-hidden rounded-md border border-border bg-background"
            >
              <div class="flex min-w-0 flex-1 items-center px-3">
                <input
                  v-if="isEditingPath"
                  ref="pathInputRef"
                  v-model="editingSlug"
                  type="text"
                  spellcheck="false"
                  autocomplete="off"
                  class="h-9 w-full min-w-0 appearance-none border-0 bg-transparent p-0 font-mono text-sm text-foreground caret-primary outline-none ring-0 selection:bg-primary/30 focus:outline-none focus:ring-0"
                  :disabled="isSaving"
                  @blur="confirmPathEdit"
                  @keydown.enter.prevent="confirmPathEdit"
                  @keydown.esc.prevent="cancelPathEdit"
                />
                <button
                  v-else
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-2 font-mono text-sm text-foreground transition-colors hover:text-primary"
                  :disabled="isSaving"
                  @click="startPathEdit"
                >
                  <span class="min-w-0 truncate text-left">
                    {{ pagePath || "/" }}
                  </span>
                  <span
                    :class="[
                      studioIcons.edit,
                      'size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/path:opacity-100',
                    ]"
                    aria-hidden="true"
                  />
                </button>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                class="h-auto shrink-0 rounded-none border-l border-border text-muted-foreground hover:text-foreground"
                :disabled="!pagePath"
                :aria-label="t('pages.overview.copyPath')"
                @click="copyPath(pagePath)"
              >
                <span :class="[studioIcons.copy, 'size-3.5']" />
              </Button>
            </div>
          </div>
        </div>

        <div class="space-y-1.5">
          <Label :class="detailLabelClass">
            {{ t("pages.column.description") }}
          </Label>
          <Textarea
            v-model="description"
            rows="3"
            class="min-h-20 resize-none"
            :placeholder="t('pages.overview.descriptionPlaceholder')"
            :disabled="isSaving"
          />
          <p class="text-xs text-muted-foreground">
            {{ t("pages.overview.descriptionHelp") }}
          </p>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-1.5">
            <Label :class="detailLabelClass">
              {{ t("pages.layout") }}
            </Label>
            <Select
              :model-value="currentLayout || NONE_VALUE"
              :disabled="isSaving"
              @update:model-value="
                emit(
                  'updateLayout',
                  $event === NONE_VALUE ? '' : String($event),
                )
              "
            >
              <SelectTrigger class="h-9">
                <SelectValue :placeholder="t('pages.none')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem :value="NONE_VALUE">{{
                  t("pages.none")
                }}</SelectItem>
                <SelectItem
                  v-for="layout in (availableLayouts ?? []).filter(
                    (item) => item.slug,
                  )"
                  :key="layout.slug"
                  :value="layout.slug"
                >
                  {{ layout.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-1.5">
            <Label :class="detailLabelClass">
              {{ t("pages.parent") }}
            </Label>
            <Select
              :model-value="currentParent || NONE_VALUE"
              :disabled="isSaving"
              @update:model-value="
                emit(
                  'updateParent',
                  $event === NONE_VALUE ? '' : String($event),
                )
              "
            >
              <SelectTrigger class="h-9">
                <SelectValue :placeholder="t('pages.overview.root')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem :value="NONE_VALUE">{{
                  t("pages.overview.root")
                }}</SelectItem>
                <SelectItem
                  v-for="parent in availableParents ?? []"
                  :key="parent.slug"
                  :value="parent.slug"
                >
                  {{ parent.title }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-1.5">
            <Label :class="detailLabelClass">
              {{ t("pages.overview.visibility") }}
            </Label>
            <Select
              :model-value="currentVisibility ?? 'public'"
              :disabled="isSaving"
              @update:model-value="
                emit(
                  'updateVisibility',
                  $event as 'public' | 'private' | 'unlisted',
                )
              "
            >
              <SelectTrigger class="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">{{
                  t("pages.access.public")
                }}</SelectItem>
                <SelectItem value="unlisted">{{
                  t("pages.access.unlisted")
                }}</SelectItem>
                <SelectItem value="private">{{
                  t("pages.access.private")
                }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
