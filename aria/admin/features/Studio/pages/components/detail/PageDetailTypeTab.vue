<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { systemRoleOptions } from "../../composables/usePageAccessState";
import { StoredPageSystemRoleSchema } from "../../../../../../lib/storage/adapter";
import type { CollectionAssignmentClear } from "../../../../../../lib/pages/cmsTemplatePolicy";
import PageCmsTemplateAssignmentPanel from "./PageCmsTemplateAssignmentPanel.vue";
import type { CmsPageAssignmentSlot } from "../../composables/usePageCmsTemplateAssignments";
import { useStudioI18n } from "@/i18n";

const props = defineProps<{
  pageId?: string;
  pageTitle?: string;
  pageSlug?: string;
  pageOptions?: readonly { id: string; label: string }[];
  isLoading?: boolean;
  isSaving?: boolean;
  error?: string | null;
  isDirty?: boolean;
  isSavedNotFound?: boolean;
  isSavedCmsCollection?: boolean;
  isSavedCmsEntry?: boolean;
  hasAssignedCollections?: boolean;
  pendingAssignmentClears?: readonly CollectionAssignmentClear[];
}>();

const emit = defineEmits<{
  save: [];
  selectNotFound: [];
  selectStandard: [];
  selectCmsCollection: [];
  selectCmsEntry: [];
  assignCollection: [];
  unassignCollection: [];
}>();

const systemRole = defineModel<
  "standard" | "not-found" | "cms-collection" | "cms-entry"
>("systemRole", {
  required: true,
});
const { t } = useStudioI18n();

function roleMessageKey(
  value: "standard" | "not-found" | "cms-collection" | "cms-entry",
): "standard" | "notFound" | "collection" | "entry" {
  if (value === "not-found") return "notFound";
  if (value === "cms-collection") return "collection";
  if (value === "cms-entry") return "entry";
  return "standard";
}

function roleLabel(value: "standard" | "not-found" | "cms-collection" | "cms-entry"): string {
  return t(`pages.type.${roleMessageKey(value)}.label` as const);
}

function roleDescription(value: "standard" | "not-found" | "cms-collection" | "cms-entry"): string {
  return t(`pages.type.${roleMessageKey(value)}.description` as const);
}

const showAssignmentPanel = computed(
  () =>
    systemRole.value === "cms-collection" ||
    systemRole.value === "cms-entry" ||
    props.isSavedCmsCollection ||
    props.isSavedCmsEntry,
);

const assignmentSlot = computed<CmsPageAssignmentSlot>(() => {
  if (systemRole.value === "cms-collection") return "list";
  if (systemRole.value === "cms-entry") return "template";
  if (props.isSavedCmsCollection) return "list";
  return "template";
});

const showPendingAssignmentClearNotice = computed(
  () =>
    systemRole.value !== "cms-collection" &&
    systemRole.value !== "cms-entry" &&
    (props.pendingAssignmentClears?.length ?? 0) > 0,
);

const pendingAssignmentClearRoleLabel = computed(() => {
  const first = props.pendingAssignmentClears?.[0];
  if (!first) return "collection";
  return first.field === "listPageId" ? "archive" : "entry";
});

const pendingAssignmentClearLabels = computed(() =>
  (props.pendingAssignmentClears ?? [])
    .map((clear) => clear.collectionLabel)
    .join(", "),
);

function handleRoleSelect(value: string): void {
  const parsed = StoredPageSystemRoleSchema.safeParse(value);
  if (!parsed.success) {
    return;
  }

  if (parsed.data === "not-found") {
    emit("selectNotFound");
    return;
  }

  if (parsed.data === "cms-collection") {
    emit("selectCmsCollection");
    systemRole.value = "cms-collection";
    return;
  }

  if (parsed.data === "cms-entry") {
    emit("selectCmsEntry");
    systemRole.value = "cms-entry";
    return;
  }

  emit("selectStandard");
}
</script>

<template>
  <div class="max-w-3xl space-y-6">
    <div v-if="isLoading" class="px-7 text-xs text-muted-foreground">
      {{ t("pages.type.loading") }}
    </div>

    <template v-else>
      <div
        v-if="isSavedNotFound"
        class="flex h-9 items-center gap-2 rounded-md bg-primary/10 px-3 text-sm text-primary"
      >
        <span class="i-hugeicons:cancel-circle size-4 shrink-0" />
        <span>{{ t("pages.type.notFoundNotice") }}</span>
      </div>

      <div
        v-if="isSavedCmsCollection"
        class="flex h-auto min-h-9 items-start gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm text-primary"
      >
        <span class="i-hugeicons:grid-view mt-0.5 size-4 shrink-0" />
        <span>
          {{ t("pages.type.collectionNotice") }}
        </span>
      </div>

      <div
        v-if="isSavedCmsEntry"
        class="flex h-auto min-h-9 items-start gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm text-primary"
      >
        <span class="i-hugeicons:layout-grid mt-0.5 size-4 shrink-0" />
        <span>
          {{ t("pages.type.entryNotice") }}
        </span>
      </div>

      <section class="space-y-3">
        <Label class="text-sm! text-muted-foreground">
          {{ t("pages.type.title") }}
        </Label>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            v-for="opt in systemRoleOptions"
            :key="opt.value"
            type="button"
            class="flex min-h-20 flex-col items-start gap-2 rounded-md border p-3 text-left transition-colors"
            :class="
              systemRole === opt.value
                ? 'border-primary bg-input text-foreground shadow-xs'
                : 'border-border bg-card/40 text-muted-foreground hover:border-primary/60 hover:text-foreground'
            "
            :disabled="isSaving"
            @click="handleRoleSelect(opt.value)"
          >
            <span class="flex items-center gap-2 text-sm font-medium">
              <span class="block size-4" :class="opt.icon" />
              {{ roleLabel(opt.value) }}
            </span>
            <span class="text-xs leading-snug">{{ roleDescription(opt.value) }}</span>
          </button>
        </div>
      </section>

      <PageCmsTemplateAssignmentPanel
        v-if="showAssignmentPanel"
        :page-id="pageId"
        :page-title="pageTitle"
        :page-options="pageOptions"
        :is-saving="isSaving"
        :slot="assignmentSlot"
        :pending-system-role="systemRole"
        @assign-collection="emit('assignCollection')"
        @unassign-collection="emit('unassignCollection')"
      />

      <div
        v-else-if="showPendingAssignmentClearNotice"
        class="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
        data-testid="cms-template-assignment-standard-clear-notice"
      >
        {{ t("pages.type.clearNotice", {
          role: pendingAssignmentClearRoleLabel,
          collections: pendingAssignmentClearLabels,
        }) }}
      </div>

      <div v-if="error" class="text-xs text-destructive">
        {{ error }}
      </div>

      <div class="flex items-center gap-3 pt-2">
        <span v-if="isDirty" class="text-xs text-muted-foreground">
          {{ t("pages.access.unsavedChanges") }}
        </span>
        <Button
          size="sm"
          class="h-9"
          :disabled="isSaving || !isDirty"
          @click="emit('save')"
        >
          {{ isSaving ? t("pages.detail.saving") : t("common.save") }}
        </Button>
      </div>
    </template>
  </div>
</template>
