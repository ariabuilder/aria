<script setup lang="ts">
import { computed, nextTick, onMounted, watch } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import ErrorBoundary from "./core/components/ErrorBoundary.vue";
import CreatePageDialog from "./pages/dialogs/CreatePageDialog.vue";
import { useCreatePageDialog } from "./pages/composables/useCreatePageDialog";
import CreateCollectionDialog from "@/features/CMS/dialogs/CreateCollectionDialog.vue";
import { useCreateCollectionDialog } from "@/features/CMS/composables/useCreateCollectionDialog";
import { useCollectionIcons } from "@/features/CMS/composables/useCollectionIcons";
import type { CreatedCollectionResult } from "@/features/CMS/composables/useCreateCollectionForm";
import { setCmsCollectionNavigationPreview } from "@/features/CMS/lib/cmsNavigationPreview";
import { useBuilderData } from "@/composables/useBuilderData";
import { useStudioRouter } from "./core/composables";
import { useAppearance } from "@/features/Design";
import { CreateComponentDialog } from "@/features/Blocks";
import { useStudioActions } from "./composer/composables/useStudioActions";
import SlugChangeRedirectPrompt from "./settings/components/SlugChangeRedirectPrompt.vue";
import {
  useComponentGrouping,
  useCreateComponentDialog,
} from "./components/composables";
import {
  STUDIO_MAIN_CLASS,
  STUDIO_SPLIT_MAIN_CLASS,
} from "./core/lib/studioPanelShell";

const emit = defineEmits<{
  ready: [];
}>();

useAppearance();

const {
  pages,
  layouts,
  components,
  refreshComponentsNow,
  siteSettings,
  isInitialized,
} = useBuilderData();
const studioRouter = useStudioRouter();
const route = useRoute();
const router = useRouter();
const studioActions = useStudioActions();
const createPageDialog = useCreatePageDialog();
const createCollectionDialog = useCreateCollectionDialog();
const createComponentDialog = useCreateComponentDialog();
const { getCollectionIcon, getCollectionIconForKind } = useCollectionIcons();
const grouping = useComponentGrouping(computed(() => components.value));

const dialogComponents = computed(() =>
  components.value.map((component) => ({
    slug: component.id,
    name: component.name,
    title: component.name,
  })),
);

const dialogGroups = computed(() =>
  grouping.customGroups.value.map((group) => ({
    id: group.id,
    name: group.name,
  })),
);

const defaultGroupId = computed(() => {
  const userGroup = grouping.customGroups.value.find(
    (group) => group.name === "User",
  );
  return userGroup?.id ?? grouping.customGroups.value[0]?.id ?? null;
});

const usesSplitPanelChrome = computed(() =>
  ["/components", "/collections", "/design", "/media"].includes(route.path) ||
  route.path.startsWith("/collections/") ||
  route.path.startsWith("/components/") ||
  route.path.startsWith("/pages/"),
);

const studioMainClass = computed(() =>
  usesSplitPanelChrome.value ? STUDIO_SPLIT_MAIN_CLASS : STUDIO_MAIN_CLASS,
);

const isOnboardingComplete = computed(() => {
  const onboarding = siteSettings.value?.onboarding as
    | { status?: string }
    | undefined;
  return onboarding?.status === "complete";
});

let onboardingRedirectInFlight = false;

watch(
  [isInitialized, isOnboardingComplete, () => route.path],
  async ([initialized, complete, path]) => {
    if (
      !initialized ||
      complete ||
      path === "/onboarding" ||
      onboardingRedirectInFlight
    ) {
      return;
    }

    onboardingRedirectInFlight = true;
    try {
      await router.replace("/onboarding");
    } finally {
      onboardingRedirectInFlight = false;
    }
  },
  { immediate: true },
);

function handleCreatePageDialogOpen(open: boolean) {
  if (open) {
    createPageDialog.open();
    return;
  }
  createPageDialog.close();
}

function handleCreateCollectionDialogOpen(open: boolean) {
  if (open) {
    createCollectionDialog.open();
    return;
  }
  createCollectionDialog.close();
}

function handlePageCreated(slug: string) {
  createPageDialog.close();
  studioRouter.navigateTo(`/pages/${slug}`);
}

function handleCollectionCreated(collection: CreatedCollectionResult) {
  createCollectionDialog.close();
  setCmsCollectionNavigationPreview({
    id: collection.id,
    name: collection.name,
    label: collection.label,
    kind: collection.kind,
    iconClass: collection.icon
      ? getCollectionIcon(collection.icon)
      : getCollectionIconForKind(collection.kind),
    itemCount: 0,
  });
  studioRouter.navigateTo(`/collections/${collection.name}`);
}

function handleCreateComponentDialogOpen(open: boolean) {
  if (open) {
    createComponentDialog.open();
    return;
  }
  createComponentDialog.close();
}

async function handleComponentCreate(payload: {
  name: string;
  groupId: string | null;
  newGroupName?: string;
}): Promise<void> {
  let targetGroupId = payload.groupId;
  let category: string | undefined;

  const trimmedNewGroupName = payload.newGroupName?.trim();
  if (trimmedNewGroupName) {
    const createdGroupId =
      await grouping.createCustomGroup(trimmedNewGroupName);
    if (!createdGroupId) return;
    targetGroupId = createdGroupId;
    category = trimmedNewGroupName;
  } else if (targetGroupId) {
    const targetGroup = grouping.customGroups.value.find(
      (group) => group.id === targetGroupId,
    );
    category = targetGroup?.name;
  }

  const slug = await createComponentDialog.submitCreateComponent(
    payload.name,
    category ? { category } : undefined,
    studioActions.createComponent,
  );

  if (!slug) return;

  if (targetGroupId) {
    await grouping.moveComponentToGroup(slug, targetGroupId);
  }

  await refreshComponentsNow();
  studioRouter.startEditing("component", slug);
}

onMounted(async () => {
  await nextTick();
  emit("ready");
});
</script>

<template>
  <main :class="studioMainClass">
    <ErrorBoundary>
      <RouterView v-slot="{ Component }">
        <div
          class="studio-route-frame"
          :class="usesSplitPanelChrome ? 'studio-route-frame--split' : ''"
        >
          <Suspense timeout="0">
            <KeepAlive
              :include="[
                'PagesView',
                'LayoutsView',
                'ComponentsView',
                'DashboardView',
                'MediaView',
                'CmsWorkspaceView',
              ]"
            >
              <component :is="Component" />
            </KeepAlive>

            <template #fallback>
              <div
                class="studio-route-fallback"
                :class="
                  usesSplitPanelChrome ? 'studio-route-fallback--split' : ''
                "
              >
                <aside
                  v-if="usesSplitPanelChrome"
                  class="studio-route-fallback-rail"
                >
                  <div class="studio-route-fallback-header">
                    <div class="h-6 w-32 animate-pulse rounded bg-muted/40" />
                  </div>
                  <div class="space-y-2 p-3">
                    <div
                      v-for="item in 6"
                      :key="`rail-skeleton-${item}`"
                      class="h-11 animate-pulse rounded-md bg-muted/25"
                    />
                  </div>
                </aside>

                <section class="studio-route-fallback-panel">
                  <div class="studio-route-fallback-header">
                    <div class="min-w-0 flex-1 space-y-2">
                      <div
                        class="h-6 w-44 animate-pulse rounded bg-muted/40"
                      />
                      <div
                        class="h-3 w-64 max-w-full animate-pulse rounded bg-muted/25"
                      />
                    </div>
                    <div class="flex shrink-0 gap-2">
                      <div
                        v-for="action in 3"
                        :key="`action-skeleton-${action}`"
                        class="size-9 animate-pulse rounded-md bg-muted/30"
                      />
                    </div>
                  </div>

                  <div class="min-h-0 flex-1 space-y-3 p-5">
                    <div class="flex gap-4 border-b border-border/50 pb-3">
                      <div
                        v-for="column in 4"
                        :key="`column-skeleton-${column}`"
                        class="h-4 flex-1 animate-pulse rounded bg-muted/30"
                      />
                    </div>
                    <div
                      v-for="row in 7"
                      :key="`route-row-skeleton-${row}`"
                      class="h-14 animate-pulse rounded-md bg-muted/20"
                    />
                  </div>
                </section>
              </div>
            </template>
          </Suspense>
        </div>
      </RouterView>
    </ErrorBoundary>

    <CreatePageDialog
      :open="createPageDialog.isOpen.value"
      :pages="pages"
      :layouts="layouts"
      @update:open="handleCreatePageDialogOpen"
      @created="handlePageCreated"
    />

    <CreateCollectionDialog
      :open="createCollectionDialog.isOpen.value"
      @update:open="handleCreateCollectionDialogOpen"
      @created="handleCollectionCreated"
    />

    <CreateComponentDialog
      :open="createComponentDialog.isOpen.value"
      :existing-components="dialogComponents"
      :groups="dialogGroups"
      :selected-group-id="defaultGroupId"
      confirm-label="Begin editing"
      :allow-new-group="grouping.canUpdateGrouping.value"
      @update:open="handleCreateComponentDialogOpen"
      @confirm="handleComponentCreate"
    />

    <SlugChangeRedirectPrompt />
  </main>
</template>

<style scoped>
.studio-route-frame {
  display: flex;
  flex: 1 1 0%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.studio-route-frame > :deep(*) {
  flex: 1 1 0%;
  min-height: 0;
  min-width: 0;
}

.studio-route-fallback {
  display: flex;
  min-height: 0;
  min-width: 0;
  flex: 1 1 0%;
  overflow: hidden;
}

.studio-route-fallback-panel,
.studio-route-fallback-rail {
  display: flex;
  min-height: 0;
  min-width: 0;
  flex-direction: column;
  overflow: hidden;
  background: var(--background);
}

.studio-route-fallback-panel {
  flex: 1 1 0%;
}

.studio-route-fallback--split {
  gap: 0.375rem;
  background: var(--sidebar);
}

.studio-route-fallback--split .studio-route-fallback-panel,
.studio-route-fallback--split .studio-route-fallback-rail {
  border: 1px solid var(--border);
  border-radius: 0.375rem;
}

.studio-route-fallback-rail {
  width: 17.5rem;
  flex: 0 0 17.5rem;
}

.studio-route-fallback-header {
  display: flex;
  height: 4.75rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px dashed color-mix(in oklab, var(--border) 50%, transparent);
  padding: 0 1.25rem;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.02);
}

</style>
