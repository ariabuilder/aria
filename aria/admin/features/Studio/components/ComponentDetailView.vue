<script setup lang="ts">
import { computed, onActivated, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBuilderData } from "@/composables/useBuilderData";
import { useStudioCapabilities } from "@/composables/useStudioCapabilities";
import {
  useComponentPolicies,
  useDialogState,
  useStudioRouter,
} from "@/features/Studio/core/composables";
import { useComponentThumbnailActions } from "./composables/useComponentThumbnailActions";
import {
  isComponentThumbnailStale,
  markComponentThumbnailStale,
} from "./composables/componentThumbnailInvalidation";
import { useStudioActions } from "@/features/Studio/composer/composables/useStudioActions";
import ComponentThumbnailPreview from "@/features/Studio/components/components/ComponentThumbnailPreview.vue";
import ComponentPropertiesPanel from "@/features/Studio/components/components/ComponentPropertiesPanel.vue";
import ActivityTimeline from "@/features/Core/components/ActivityTimeline.vue";
import { buildComponentActivityItems } from "./lib/componentActivity";
import { useComponentVersions } from "./composables/useComponentVersions";
import {
  ComposerButton,
  DeleteConfirmDialog,
} from "@/features/Studio/core/components";
import Breadcrumbs from "@/features/Studio/core/components/Breadcrumbs.vue";
import HeaderActionDropdownTooltip from "@/features/Studio/core/components/HeaderActionDropdownTooltip.vue";
import HeaderActionTooltip from "@/features/Studio/core/components/HeaderActionTooltip.vue";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";
import type { Component } from "@/composables/useBuilderData";
import StudioPresenceNotice from "@/features/Studio/realtime/StudioPresenceNotice.vue";
import { useStudioLive } from "@/features/Studio/realtime/useStudioLive";

defineOptions({ name: "ComponentDetailView" });

const COMPONENT_DETAIL_TABS = [
  { id: "overview", label: "Overview" },
  { id: "content", label: "Content" },
  { id: "usage", label: "Usage" },
  { id: "advanced", label: "Advanced" },
] as const;

type ComponentDetailTab = (typeof COMPONENT_DETAIL_TABS)[number]["id"];

interface ComponentPropertiesPanelPublic {
  saveChanges: () => Promise<void>;
  isLoading: boolean;
  isSaving: boolean;
  isLocked: boolean;
  hasUnsavedChanges: boolean;
}

const route = useRoute();
const { t } = useStudioI18n();
const router = useStudioRouter();
const studioActions = useStudioActions();
const thumbnailActions = useComponentThumbnailActions();
const componentVersions = useComponentVersions();
const studioLive = useStudioLive();
const { components, isReady } = useBuilderData();
const {
  canCreatePage,
  canDeletePage,
  getForbiddenMessage,
} = useStudioCapabilities();
const {
  isComponentAria,
  getActionRestriction,
} = useComponentPolicies<Component>();

const isDuplicating = ref(false);
const isDeleting = ref(false);
const activeTab = ref<ComponentDetailTab>("overview");
const componentPanelRef = ref<ComponentPropertiesPanelPublic | null>(null);
const headerDraftName = ref("");
const deleteDialog = useDialogState();
const componentBreadcrumbs = computed(() => [
  { label: "Components", href: "/components" },
  { label: headerDraftName.value || "Component" },
]);

const componentId = computed(() => String(route.params.slug ?? ""));

const componentMeta = computed(() =>
  components.value.find((component) => component.id === componentId.value),
);

const componentTitle = computed(
  () => componentMeta.value?.name || componentId.value || "Component",
);

const showHeaderActions = computed(
  () =>
    Boolean(componentId.value) &&
    Boolean(componentMeta.value),
);

const isPanelLoading = computed(() => Boolean(componentPanelRef.value?.isLoading));
const isPanelSaving = computed(() => Boolean(componentPanelRef.value?.isSaving));
const isPanelLocked = computed(() => Boolean(componentPanelRef.value?.isLocked));
const hasPanelUnsavedChanges = computed(() =>
  Boolean(componentPanelRef.value?.hasUnsavedChanges),
);

watch(
  [componentId, hasPanelUnsavedChanges],
  ([resourceId, dirty]) => {
    if (!resourceId) return;
    studioLive.setPresence({
      surface: "studio",
      resourceType: "component",
      resourceId,
      state: dirty ? "editing" : "viewing",
      dirty,
    });
  },
  { immediate: true },
);

const isSaveDisabled = computed(
  () =>
    !componentMeta.value ||
    isPanelLoading.value ||
    isPanelSaving.value ||
    isPanelLocked.value ||
    !hasPanelUnsavedChanges.value,
);

const saveTooltip = computed(() => {
  if (isPanelSaving.value) return "Saving...";
  if (isPanelLoading.value) return "Loading component";
  if (isPanelLocked.value) return "This component is read-only";
  if (!hasPanelUnsavedChanges.value) return "No changes to save";
  return "Save changes";
});

const editDisabledReason = computed(() =>
  componentMeta.value ? getActionRestriction(componentMeta.value, "edit") : null,
);

const composerButtonLabel = computed(() =>
  editDisabledReason.value ? "View in Composer" : "Edit in Composer",
);

const deleteRestriction = computed(() =>
  componentMeta.value
    ? getActionRestriction(componentMeta.value, "delete")
    : "Component unavailable",
);

const duplicateLabel = computed(() =>
  componentMeta.value && isComponentAria(componentMeta.value)
    ? "Save as Personal"
    : "Duplicate Component",
);

const thumbnailRefreshToken = computed(() =>
  thumbnailActions.getComponentThumbnailRefreshToken(componentId.value),
);

const componentActivityItems = computed(() =>
  buildComponentActivityItems({
    versions: componentVersions.versions.value,
    updatedAt: componentMeta.value?.updatedAt ?? null,
  }),
);

let lastThumbnailCheckKey = "";

watch(
  [componentId, isReady, components],
  () => {
    if (!isReady.value || !componentId.value) return;
    void componentVersions.loadVersions(componentId.value);
  },
  { flush: "post", immediate: true },
);

watch(
  [componentId, isReady, components],
  () => {
    if (!isReady.value) return;
    if (componentMeta.value) return;
    toast.error("Component not found");
    router.navigateTo("/components");
  },
  { flush: "post" },
);

watch(componentId, () => {
  activeTab.value = "overview";
});

watch(
  [componentId, componentTitle],
  () => {
    headerDraftName.value = componentTitle.value;
  },
  { immediate: true },
);

async function refreshCurrentThumbnailIfNeeded(): Promise<void> {
  if (!isReady.value || !componentMeta.value) {
    return;
  }

  const component = componentMeta.value;
  const checkKey = [
    component.id,
    component.updatedAt ?? "",
    component.thumbnailUrl ?? "",
    isComponentThumbnailStale(component.id) ? "stale" : "fresh",
  ].join(":");

  if (checkKey === lastThumbnailCheckKey) {
    return;
  }

  lastThumbnailCheckKey = checkKey;
  await thumbnailActions.refreshMissingOrStaleThumbnail(
    component.id,
    component.thumbnailUrl ?? null,
  );
}

watch(
  [componentId, isReady, components],
  () => {
    void refreshCurrentThumbnailIfNeeded();
  },
  { flush: "post" },
);

onActivated(() => {
  void refreshCurrentThumbnailIfNeeded();
});

function handleBack(): void {
  router.navigateTo("/components");
}

async function handleSaveClick(): Promise<void> {
  if (isSaveDisabled.value) return;
  await componentPanelRef.value?.saveChanges();
}

async function handleDuplicateClick(): Promise<void> {
  if (!componentMeta.value || isDuplicating.value) return;

  if (!canCreatePage.value) {
    toast.error(getForbiddenMessage("crud.createItem"));
    return;
  }

  isDuplicating.value = true;
  try {
    const newId = await studioActions.duplicateComponent(componentId.value);
    if (newId) {
      markComponentThumbnailStale(newId);
      router.navigateTo(`/components/${newId}`);
    }
  } finally {
    isDuplicating.value = false;
  }
}

function handleComponentSaved(component: { id: string }): void {
  void componentVersions.loadVersions(component.id);
}

function handleDeleteClick(): void {
  if (!componentMeta.value) return;

  if (deleteRestriction.value) {
    return;
  }

  if (!canDeletePage.value) {
    toast.error(getForbiddenMessage("crud.deleteItem"));
    return;
  }

  deleteDialog.open();
}

async function executeDelete(): Promise<void> {
  if (!componentId.value || isDeleting.value) return;

  isDeleting.value = true;
  try {
    const ok = await studioActions.deleteComponent(componentId.value);
    deleteDialog.close();
    if (ok) {
      router.navigateTo("/components");
      return;
    }
    toast.error(
      "Component could not be deleted. It may still be in use on pages or layouts.",
    );
  } finally {
    isDeleting.value = false;
  }
}

</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-sidebar">
    <div
      v-if="componentId"
      class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-solid border-border bg-background"
    >
      <StudioPresenceNotice
        resource-type="component"
        :resource-id="componentId"
        resource-label="component"
      />
      <header
        class="flex min-w-0 shrink-0 items-center justify-between bg-background px-3 pt-3"
      >
        <div class="flex min-w-0 flex-1 items-center gap-1.5">
          <Button
            variant="bread"
            size="icon"
            data-testid="collection-detail-back"
            @click="handleBack"
          >
            <span :class="[studioIcons.chevronLeft, 'size-4']" />
          </Button>
          <Breadcrumbs :items="componentBreadcrumbs" />
        </div>
      </header>

      <div
        v-if="showHeaderActions"
        class="flex shrink-0 items-center justify-end bg-background px-3 pb-2"
      >
        <div
          class="flex shrink-0 items-center gap-0 [&_[data-slot=button]:hover]:z-10 [&_[data-slot=button]:focus-visible]:z-10 [&_[data-slot=button][data-state=open]]:z-10"
        >
          <HeaderActionTooltip :label="saveTooltip" :disabled="isSaveDisabled">
            <Button
              variant="headerAction"
              size="icon-header"
              :disabled="isSaveDisabled"
              @click="handleSaveClick"
            >
              <span
                v-if="isPanelSaving"
                class="i-hugeicons:loading-01 size-3.5 shrink-0 animate-spin"
              />
              <span v-else :class="[studioIcons.save, 'size-3.5 shrink-0']" />
            </Button>
          </HeaderActionTooltip>

          <HeaderActionDropdownTooltip label="Component actions">
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button
                  type="button"
                  variant="headerAction"
                  size="icon-header"
                  :disabled="isDuplicating || isDeleting"
                  aria-label="Component actions"
                >
                  <span
                    :class="[studioIcons.moreHorizontal, 'size-3.5 shrink-0']"
                  />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="w-48">
                <DropdownMenuItem
                  :disabled="isDuplicating"
                  @click="handleDuplicateClick"
                >
                  <span :class="[studioIcons.duplicate, 'size-3.5 mr-2']" />
                  {{ duplicateLabel }}
                </DropdownMenuItem>

                <DropdownMenuItem
                  variant="destructive"
                  :disabled="!!deleteRestriction || isDuplicating || isDeleting"
                  :title="deleteRestriction ?? undefined"
                  @click="handleDeleteClick"
                >
                  <span :class="[studioIcons.trash, 'size-3.5 mr-2']" />
                  Delete Component
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </HeaderActionDropdownTooltip>
        </div>

        <div class="ml-2 flex shrink-0 items-center gap-1.5 pl-2">
          <ComposerButton
            item-type="component"
            :slug="componentId"
            :label="composerButtonLabel"
          />
        </div>
      </div>

      <div
        class="flex h-12 shrink-0 items-stretch gap-1 border-b border-dashed border-border bg-background px-7"
      >
        <Button
          v-for="tab in COMPONENT_DETAIL_TABS"
          :key="tab.id"
          type="button"
          size="tab"
          :variant="activeTab === tab.id ? 'tab-active' : 'tab'"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </Button>
      </div>

      <div
        class="grid min-h-0 flex-1 gap-6 overflow-hidden p-4 xl:grid-cols-[minmax(0,1fr)_20rem]"
      >
        <div class="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <ComponentPropertiesPanel
            ref="componentPanelRef"
            v-model:active-tab="activeTab"
            v-model:name="headerDraftName"
            :component-id="componentId"
            @saved="handleComponentSaved"
          />
        </div>

        <aside
          class="grid min-w-0 content-start gap-6 overflow-y-auto xl:sticky xl:top-0 xl:self-start xl:max-h-full"
        >
          <div class="w-full overflow-hidden rounded-md border border-solid border-border/50 bg-card/40">
            <div class="flex items-center justify-between gap-3 px-5 pt-3">
              <div class="min-w-0">
                <p class="m-0 text-sm font-semibold leading-none text-foreground">
                  Component Preview
                </p>
              </div>
            </div>

            <div class="p-1.5">
              <div
                class="relative block w-full overflow-hidden rounded-lg border border-border bg-muted/20"
              >
                <div class="aspect-video w-full">
                  <ComponentThumbnailPreview
                    class="h-full w-full"
                    :key="`${componentId}:${componentMeta?.thumbnailUrl ?? ''}:${thumbnailRefreshToken ?? ''}`"
                    :component-id="componentId"
                    :thumbnail-url="componentMeta?.thumbnailUrl"
                    :thumbnail-refresh-token="thumbnailRefreshToken"
                    :updated-at="componentMeta?.updatedAt"
                    suppress-live-fallback
                    thumbnail-fit="cover"
                    eager
                  />
                </div>
              </div>
            </div>
          </div>

          <ActivityTimeline
            :items="componentActivityItems"
            :is-loading="componentVersions.isLoading.value"
          />
        </aside>
      </div>
    </div>

    <DeleteConfirmDialog
      :open="deleteDialog.isOpen.value"
      :title="t('components.dialog.deleteTitle')"
      :description="t('components.dialog.deleteDescription')"
      :item-name="componentTitle"
      :is-loading="isDeleting"
      @update:open="
        deleteDialog.isOpen.value ? deleteDialog.close() : deleteDialog.open()
      "
      @confirm="executeDelete"
    />
  </div>
</template>
