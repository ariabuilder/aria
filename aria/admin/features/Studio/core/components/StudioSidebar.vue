<script setup lang="ts">
import { defineAsyncComponent, computed, watch } from "vue";
import { useSettingsDialog } from "@/features/Studio/settings";
import { useHistoryDialog } from "@/features/Studio/history";
import { useRoute } from "vue-router";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useStudioRouter } from "@/features/Studio/core/composables";
import {
  formatModifierShortcut,
  formatAltShortcut,
  AGENT_ALT_SHORTCUT_KEY,
  AGENT_SHORTCUT_KEY,
  SIDEBAR_TOGGLE_SHORTCUT_KEY,
} from "@/lib/keyboardShortcuts";
import { useSidebarState } from "@/features/Studio/core/composables/useSidebarState";
import { useSlidingNavIndicator } from "@/features/Studio/core/composables/useSlidingNavIndicator";
import { logoutUser } from "@/features/Auth/composables/useAuthApi";
import { useUser } from "@/features/Auth/composables/useUser";
import { useBuilderData } from "@/composables/useBuilderData";
import { studioIcons } from "@/lib/icons";
import {
  DESIGN_SIDEBAR_CHILDREN,
  type DesignParam,
} from "@/features/Design/types";
import { useSearchDialog } from "@/features/Studio/search";
import { isFeatureEnabled } from "@/lib/features";
import {
  useAgentPanel,
  useAgentAvailability,
  useAgentRuntimeStatus,
  useAgentShellVisibility,
} from "@/features/Agent";
import { useSiteSettings } from "@/composables/useSiteSettings";
import { useStudioI18n } from "@/i18n";
import SidebarLogo from "./SidebarLogo.vue";
import SidebarNavItem from "./SidebarNavItem.vue";
import SidebarNavGroup from "./SidebarNavGroup.vue";
import SidebarUser from "./SidebarUser.vue";
import SlidingNavIndicator from "./SlidingNavIndicator.vue";
import { useInjectedPrewarmBuilder } from "@/features/Core/composables/useAppInjectedRuntime";
import { useComponentGrouping } from "@/features/Studio/components/composables/useComponentGrouping";
import { isUserComponent } from "@/features/Studio/components/lib/isUserComponent";
import {
  buildComponentsNavChildren,
  isComponentsNavChildActive,
} from "@/features/Studio/components/lib/buildComponentsNavChildren";
import {
  buildMediaNavChildren,
  isMediaNavChildActive,
} from "@/features/Studio/media/lib/buildMediaNavChildren";
import { useCollectionsList } from "@/features/CMS/composables/useCollectionsList";
import { useCollectionIcons } from "@/features/CMS/composables/useCollectionIcons";
import CmsCollectionIconPreview from "@/features/CMS/components/CmsCollectionIconPreview.vue";
import {
  prewarmCollection,
  prewarmEntryList,
} from "@/features/CMS/composables/useCmsDataCache";
import {
  buildCollectionsNavChildren,
  isCollectionsNavChildActive,
  type CollectionsNavChild,
} from "@/features/CMS/lib/buildCollectionsNavChildren";

import SettingsDialog from "@/features/Studio/settings/SettingsDialog.vue";
const HistoryDialog = defineAsyncComponent(
  () => import("@/features/Studio/history/HistoryDialog.vue"),
);
const StudioCommandPalette = defineAsyncComponent(
  () => import("@/features/Studio/search/components/StudioCommandPalette.vue"),
);

const prewarmBuilder = useInjectedPrewarmBuilder();
let hasPrewarmedBuilder = false;
const PREWARM_GROUPS = new Set<string>(["pages", "layouts", "components"]);
function handleNavGroupHover(groupId: string): void {
  if (groupId === "collections") {
    requestCollectionsForSidebar();
  }

  if (!hasPrewarmedBuilder && PREWARM_GROUPS.has(groupId)) {
    hasPrewarmedBuilder = true;
    void prewarmBuilder();
  }
}

const router = useStudioRouter();
const settingsDialog = useSettingsDialog();
const { t } = useStudioI18n();
const { fetchUser } = useUser();
const historyDialog = useHistoryDialog();
const searchDialog = useSearchDialog();
const agentRuntime = useAgentRuntimeStatus();
const agentAvailability = useAgentAvailability();
const agentPanel = useAgentPanel();
const agentWorkingInBackground = computed(
  () => agentRuntime.isWorking.value && !agentPanel.isOpen.value,
);
const { showAgentShell } = useAgentShellVisibility();
const { loadSettings } = useSiteSettings();
void loadSettings();
void agentAvailability.refresh();
const route = useRoute();
const {
  pages,
  layouts,
  components: builderComponents,
  isLoading,
} = useBuilderData();
const {
  isCollapsed,
  isSidebarAnimating,
  openGroups,
  sidebarWidth,
  toggleSidebar,
  toggleGroup,
  closeAllGroups,
} = useSidebarState();
const {
  collections,
  isLoading: collectionsLoading,
  loadCollections,
} = useCollectionsList();
const { getCollectionIcon, getCollectionIconForKind } = useCollectionIcons();
let hasRequestedCollectionsForSidebar = false;

function requestCollectionsForSidebar(): void {
  if (hasRequestedCollectionsForSidebar || collectionsLoading.value) return;
  hasRequestedCollectionsForSidebar = true;
  void loadCollections();
}

function prewarmSidebarCollection(child: CollectionsNavChild): void {
  if (!child.collectionName) return;
  prewarmCollection(child.collectionName);
  const collection = collections.value.find(
    (item) => item.name === child.collectionName,
  );
  if (!collection) return;
  prewarmEntryList({
    collectionId: collection.id,
    page: 1,
    limit: 50,
    sort: [{ field: "updatedAt", direction: "desc" }],
  });
}

watch(
  () => route.path,
  (path) => {
    if (path === "/dashboard") {
      closeAllGroups();
    }
    if (path.startsWith("/components")) {
      openGroups.value.components = true;
    }
    if (path.startsWith("/collections")) {
      openGroups.value.collections = true;
      requestCollectionsForSidebar();
    }
  },
  { immediate: true },
);

const userComponents = computed(() =>
  builderComponents.value.filter(isUserComponent),
);

const componentGrouping = useComponentGrouping(userComponents);

const componentsNavChildren = computed(() => {
  if (!componentGrouping.canReadGrouping.value) {
    return buildComponentsNavChildren([]).map((child) => ({
      ...child,
      label: child.filter === "all" ? t("sidebar.allComponents") : child.label,
    }));
  }
  return buildComponentsNavChildren(componentGrouping.customGroups.value).map(
    (child) => ({
      ...child,
      label: child.filter === "all" ? t("sidebar.allComponents") : child.label,
    }),
  );
});

const isComponentsRoute = computed(() => route.path.startsWith("/components"));
const shouldAnimateSidebarWidth = computed(() => !isComponentsRoute.value);

const mediaNavChildren = computed(() =>
  buildMediaNavChildren().map((child) => ({
    ...child,
    label: mediaNavLabel(child.filter),
  })),
);
const collectionsNavChildren = computed(() =>
  buildCollectionsNavChildren(collections.value).map((child) => ({
    ...child,
    label: child.collectionName ? child.label : t("sidebar.allCollections"),
  })),
);

function mediaNavLabel(filter: string | undefined): string {
  switch (filter) {
    case "image":
      return t("media.filter.images");
    case "video":
      return t("media.filter.videos");
    case "font":
      return t("media.filter.fonts");
    case "icon":
      return t("media.filter.icons");
    case "file":
      return t("media.filter.files");
    default:
      return t("media.sidebar.all");
  }
}

function designNavLabel(param: DesignParam): string {
  switch (param) {
    case "colors":
      return t("design.section.colors");
    case "typography":
      return t("design.section.typography");
    case "globals":
      return t("design.section.globalStyles");
    case "icons":
      return t("design.section.icons");
    case "breakpoints":
      return t("design.section.breakpoints");
    case "framework":
      return t("design.section.framework");
    case "classes":
      return t("design.section.classManager");
    case "variables":
      return t("design.section.variableManager");
  }
}

const detailComponentSlug = computed(() => {
  const match = route.path.match(/^\/components\/([^/]+)$/);
  return match?.[1] ?? null;
});

const detailAssignmentGroupId = computed(() => {
  if (!detailComponentSlug.value) {
    return null;
  }
  const effective = componentGrouping.buildEffectiveAssignments(
    userComponents.value,
  );
  return effective[detailComponentSlug.value] ?? null;
});

watch(
  () => settingsDialog.isOpen.value,
  (open, wasOpen) => {
    if (wasOpen && !open && settingsDialog.sessionProfileDirty.value) {
      void fetchUser({ force: true });
      settingsDialog.clearSessionProfileDirty();
    }
  },
);

function isActive(path: string): boolean {
  if (path === "/") return route.path === "/";
  return route.path === path || route.path.startsWith(path + "/");
}

function isGroupActive(path: string): boolean {
  return route.path.startsWith(path);
}

function navigateTo(path: string) {
  if (path === "/settings") {
    settingsDialog.open();
    return;
  }
  if (path === "/history") {
    historyDialog.open();
    return;
  }
  if (path === "/search") {
    searchDialog.open();
    return;
  }
  router.navigateTo(path);
}

function openSearch(): void {
  searchDialog.open();
}

const sidebarActionTooltipSide = computed(() =>
  isCollapsed.value ? "right" : "top",
);

const sidebarActions = computed(() => {
  const actions: Array<{
    id: string;
    label: string;
    shortcut?: string;
    icon: string;
    onClick: () => void;
  }> = [];

  if (showAgentShell.value) {
    actions.push({
      id: "agent",
      label: t("sidebar.agent"),
      shortcut: AGENT_SHORTCUT_KEY,
      icon: studioIcons.sparkles,
      onClick: () => agentPanel.toggle(),
    });
  }

  actions.push(
    {
      id: "toggle",
      label: isCollapsed.value ? t("sidebar.expand") : t("sidebar.collapse"),
      shortcut: SIDEBAR_TOGGLE_SHORTCUT_KEY,
      icon: isCollapsed.value ? studioIcons.expand : studioIcons.collapse,
      onClick: toggleSidebar,
    },
    {
      id: "search",
      label: t("sidebar.search"),
      shortcut: formatModifierShortcut("K"),
      icon: studioIcons.search,
      onClick: openSearch,
    },
    {
      id: "settings",
      label: t("sidebar.settings"),
      shortcut: formatModifierShortcut(","),
      icon: studioIcons.settings,
      onClick: () => settingsDialog.open(),
    },
  );

  return actions;
});

/**
 * Whether a specific Design sub-section is the active one.
 * Matches bare query keys: ?colors, ?typography, ?globals, etc.
 */
function isDesignChildActive(param: DesignParam): boolean {
  return param in route.query;
}

async function handleLogout() {
  const result = await logoutUser();
  if ("success" in result) {
    window.location.href = "/admin/login";
  }
}

function navigateAndOpenGroup(path: string, groupId: string) {
  if (groupId === "design") {
    router.navigateTo("/design?colors");
  } else {
    router.navigateTo(path);
  }
  if (!isCollapsed.value) {
    closeAllGroups();
    openGroups.value[groupId] = true;
  }
}

interface SidebarFilterChild {
  label: string;
  path: string;
  filter?: string;
}

const pageNavChildren = computed<SidebarFilterChild[]>(() => [
  { label: t("sidebar.allPages"), path: "/pages" },
  { label: t("sidebar.published"), path: "/pages?filter=published", filter: "published" },
  { label: t("sidebar.draft"), path: "/pages?filter=draft", filter: "draft" },
  { label: t("sidebar.scheduled"), path: "/pages?filter=scheduled", filter: "scheduled" },
  { label: t("sidebar.archived"), path: "/pages?filter=archived", filter: "archived" },
  { label: t("sidebar.modified"), path: "/pages?filter=modified", filter: "modified" },
]);

const layoutNavChildren = computed<SidebarFilterChild[]>(() => [
  { label: t("sidebar.allLayouts"), path: "/layouts" },
  { label: t("sidebar.used"), path: "/layouts?filter=used", filter: "used" },
  { label: t("sidebar.unused"), path: "/layouts?filter=unused", filter: "unused" },
]);

function isSidebarFilterChildActive(
  child: SidebarFilterChild,
  basePath: string,
): boolean {
  if (route.query.filter !== child.filter) return false;
  if (child.filter !== undefined) return true;
  return route.path === basePath;
}

function getCollectionNavIcon(child: CollectionsNavChild): string {
  if (!child.collectionName) {
    return studioIcons.collections;
  }
  return child.iconName
    ? getCollectionIcon(child.iconName)
    : getCollectionIconForKind(child.kind ?? "content");
}

const navItems = computed(() => {
  const items = [
    {
      type: "item" as const,
      label: t("sidebar.dashboard"),
      path: "/dashboard",
      icon: studioIcons.dashboard,
    },
    {
      type: "group" as const,
      label: t("sidebar.pages"),
      path: "/pages",
      icon: studioIcons.pages,
      groupId: "pages",
    },
    {
      type: "group" as const,
      label: t("sidebar.components"),
      path: "/components",
      icon: studioIcons.components,
      groupId: "components",
    },
    ...(isFeatureEnabled("studio.layouts")
      ? [
          {
            type: "group" as const,
            label: t("sidebar.layouts"),
            path: "/layouts",
            icon: studioIcons.layouts,
            groupId: "layouts",
          },
        ]
      : []),
    {
      type: "group" as const,
      label: t("sidebar.collections"),
      path: "/collections",
      icon: studioIcons.collections,
      groupId: "collections",
    },
    {
      type: "group" as const,
      label: t("sidebar.media"),
      path: "/media",
      icon: studioIcons.media,
      groupId: "media",
    },
    {
      type: "group" as const,
      label: t("sidebar.design"),
      path: "/design",
      icon: studioIcons.design,
      groupId: "design",
    },
  ];

  return items;
});

watch(
  isCollapsed,
  (collapsed) => {
    if (!collapsed) {
      closeAllGroups();
      for (const item of navItems.value) {
        if (item.type === "group" && isGroupActive(item.path)) {
          openGroups.value[item.groupId] = true;
          break;
        }
      }
    }
  },
  { immediate: true },
);

const activeNavKey = computed(() => {
  for (const item of navItems.value) {
    if (item.type === "item" && isActive(item.path)) return item.path;
    if (item.type === "group" && isGroupActive(item.path)) return item.path;
  }
  return null;
});

const {
  navRef: sidebarNavRef,
  indicator: sidebarNavIndicator,
  indicatorAnimated: sidebarNavIndicatorAnimated,
  registerButton: registerSidebarNavButton,
  onItemEnter: onSidebarNavEnter,
  onNavLeave: onSidebarNavLeave,
  updateIndicator: updateSidebarNavIndicator,
} = useSlidingNavIndicator({
  enabled: computed(() => true),
  activeKey: activeNavKey,
  paused: computed(
    () => shouldAnimateSidebarWidth.value && isSidebarAnimating.value,
  ),
});
</script>

<template>
  <div class="studio-sidebar-shell admin-sidebar-height relative flex shrink-0">
    <aside
      :class="[
        sidebarWidth,
        'studio-sidebar admin-sidebar-height relative z-20 flex shrink-0 flex-col bg-sidebar py-4 text-sidebar-foreground',
        shouldAnimateSidebarWidth
          ? 'transition-[width] duration-200 ease-in-out'
          : 'transition-none',
        isSidebarAnimating &&
          shouldAnimateSidebarWidth &&
          'studio-sidebar--animating',
      ]"
      style="view-transition-name: none"
    >
      <SidebarLogo
        :collapsed="isCollapsed"
        @navigate="navigateTo('/dashboard')"
      />

      <nav
        ref="sidebarNavRef"
        :class="[
          'sidebar-nav relative flex min-h-0 flex-1 flex-col overflow-y-auto py-4',
          isCollapsed ? 'justify-center space-y-1' : 'justify-start gap-1',
        ]"
        @scroll="!isSidebarAnimating && updateSidebarNavIndicator()"
        @mouseleave="onSidebarNavLeave"
      >
        <SlidingNavIndicator
          :visible="sidebarNavIndicator.visible"
          :top="sidebarNavIndicator.top"
          :height="sidebarNavIndicator.height"
          :animated="sidebarNavIndicatorAnimated"
        />

        <template v-for="item in navItems" :key="item.label">
          <SidebarNavItem
            v-if="item.type === 'item'"
            :label="item.label"
            :path="item.path"
            :icon="item.icon"
            :active="isActive(item.path)"
            :collapsed="isCollapsed"
            :indicator-id="item.path"
            @navigate="navigateTo"
            @register-indicator="registerSidebarNavButton"
            @indicator-enter="onSidebarNavEnter"
          />
          <SidebarNavGroup
            v-else
            :label="item.label"
            :path="item.path"
            :icon="item.icon"
            :group-id="item.groupId"
            :open="openGroups[item.groupId]"
            :active="isGroupActive(item.path)"
            :collapsed="isCollapsed"
            :indicator-id="item.path"
            :render-children="
              !(
                item.groupId === 'components' &&
                shouldAnimateSidebarWidth &&
                isSidebarAnimating
              )
            "
            @navigate="navigateAndOpenGroup"
            @toggle="toggleGroup"
            @hover="handleNavGroupHover"
            @register-indicator="registerSidebarNavButton"
            @indicator-enter="onSidebarNavEnter"
          >
            <template #children>
              <!-- Pages -->
              <div
                v-if="item.groupId === 'pages'"
                class="ml-5.3 flex flex-col py-2 gap-0 border-l border-border border-dashed pl-4"
              >
                <Button
                  v-for="child in pageNavChildren"
                  :key="child.label"
                  variant="ghost"
                  class="w-full !justify-start px-3 py-1.5 h-auto text-left transition-colors"
                  :class="
                    isSidebarFilterChildActive(child, '/pages')
                      ? '!text-primary'
                      : '!text-muted-foreground/75 hover:!text-sidebar-foreground'
                  "
                  @click="navigateTo(child.path)"
                >
                  {{ child.label }}
                </Button>
              </div>

              <!-- Layouts -->
              <div
                v-if="item.groupId === 'layouts'"
                class="ml-5.3 flex flex-col py-2 gap-0 border-l border-border border-dashed pl-4"
              >
                <Button
                  v-for="child in layoutNavChildren"
                  :key="child.label"
                  variant="ghost"
                  class="w-full !justify-start px-3 py-1.5 h-auto text-left transition-colors"
                  :class="
                    isSidebarFilterChildActive(child, '/layouts')
                      ? '!text-primary'
                      : '!text-muted-foreground/75 hover:!text-sidebar-foreground'
                  "
                  @click="navigateTo(child.path)"
                >
                  {{ child.label }}
                </Button>
              </div>

              <!-- Components -->
              <div
                v-if="item.groupId === 'components'"
                class="ml-5.3 flex flex-col py-2 gap-0 border-l border-border border-dashed pl-4"
              >
                <Button
                  v-for="child in componentsNavChildren"
                  :key="child.path"
                  variant="ghost"
                  class="w-full !justify-start px-3 py-1.5 h-auto text-left transition-colors"
                  :class="
                    isComponentsNavChildActive(
                      child,
                      route.path,
                      route.query.filter,
                      detailAssignmentGroupId,
                    )
                      ? '!text-primary'
                      : '!text-muted-foreground/75 hover:!text-sidebar-foreground'
                  "
                  :title="child.label"
                  @focusin="prewarmSidebarCollection(child)"
                  @mouseenter="prewarmSidebarCollection(child)"
                  @click="navigateTo(child.path)"
                >
                  <span class="truncate">{{ child.label }}</span>
                </Button>
              </div>

              <!-- Collections -->
              <div
                v-if="item.groupId === 'collections'"
                class="ml-5.3 flex flex-col py-2 gap-0 border-l border-border border-dashed pl-4"
              >
                <Button
                  v-for="child in collectionsNavChildren"
                  :key="child.path"
                  variant="ghost"
                  class="w-full !justify-start gap-2 px-3 py-1.5 h-auto text-left transition-colors"
                  :class="
                    isCollectionsNavChildActive(child, route.path)
                      ? '!text-primary'
                      : '!text-muted-foreground/75 hover:!text-sidebar-foreground'
                  "
                  :title="child.label"
                  @click="navigateTo(child.path)"
                >
                  <CmsCollectionIconPreview
                    :value="getCollectionNavIcon(child)"
                    class="size-3.5 shrink-0"
                  />
                  <span class="truncate">{{ child.label }}</span>
                </Button>
              </div>

              <!-- Media -->
              <div
                v-if="item.groupId === 'media'"
                class="ml-5.3 flex flex-col py-2 gap-0 border-l border-border border-dashed pl-4"
              >
                <Button
                  v-for="child in mediaNavChildren"
                  :key="child.path"
                  variant="ghost"
                  class="w-full !justify-start px-3 py-1.5 h-auto text-left transition-colors"
                  :class="
                    isMediaNavChildActive(
                      child,
                      route.path,
                      route.query.filter,
                      route.query.group,
                    )
                      ? '!text-primary'
                      : '!text-muted-foreground/75 hover:!text-sidebar-foreground'
                  "
                  :title="child.label"
                  @click="navigateTo(child.path)"
                >
                  <span class="truncate">{{ child.label }}</span>
                </Button>
              </div>

              <!-- Design — 100% typed via DESIGN_SIDEBAR_CHILDREN -->
              <div
                v-if="item.groupId === 'design'"
                :class="[
                  'ml-5.3 py-2 pb-4 flex flex-col gap-0 border-l border-border border-dashed pl-4',
                  { 'border-b': !isCollapsed },
                ]"
              >
                <Button
                  v-for="child in DESIGN_SIDEBAR_CHILDREN"
                  :key="child.param"
                  variant="ghost"
                  class="w-full !justify-start px-3 py-1.5 h-auto text-left transition-colors"
                  :class="
                    isDesignChildActive(child.param)
                      ? '!text-primary'
                      : '!text-muted-foreground/75 hover:!text-sidebar-foreground'
                  "
                  @click="navigateTo(`/design?${child.param}`)"
                >
                  {{ designNavLabel(child.param) }}
                </Button>
              </div>
            </template>
          </SidebarNavGroup>
        </template>
      </nav>

      <!-- Spacer -->
      <div class="shrink-0 h-3" />

      <!-- Sidebar Actions -->
      <div
        :class="[
          'shrink-0',
          isCollapsed
            ? 'flex flex-col items-center gap-2 py-2'
            : 'pl-2 mx-2 flex flex-row items-center justify-start gap-2 py-0',
        ]"
      >
        <TooltipProvider
          :delay-duration="0"
          :skip-delay-duration="0"
          :disable-hoverable-content="true"
        >
          <Tooltip v-for="action in sidebarActions" :key="action.id">
            <TooltipTrigger as-child>
              <Button
                type="button"
                variant="sidebar-action"
                size="xs"
                :class="[
                  'relative',
                  action.id === 'agent' && agentWorkingInBackground
                    ? 'agent-streaming'
                    : '',
                ]"
                :aria-label="action.label"
                @click="action.onClick"
              >
                <span
                  :class="[
                    action.icon,
                    'size-3 shrink-0',
                    action.id === 'agent' && agentWorkingInBackground
                      ? 'text-primary'
                      : '',
                  ]"
                />
                <span
                  v-if="
                    action.id === 'agent' &&
                    agentWorkingInBackground &&
                    agentRuntime.isBuilding.value &&
                    agentRuntime.completedSectionCount.value > 0
                  "
                  data-testid="studio-agent-build-count"
                  class="pointer-events-none absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-primary px-1 text-center text-[9px] font-semibold leading-4 text-primary-foreground"
                >
                  {{ agentRuntime.completedSectionCount.value }}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent
              :side="sidebarActionTooltipSide"
              :side-offset="8"
              class="flex items-center gap-2 whitespace-nowrap"
            >
              {{ action.label }}
              <span
                v-if="action.shortcut"
                class="font-mono text-[10px] text-muted-foreground/70"
              >
                {{ action.shortcut }}
              </span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <SidebarUser
        :collapsed="isCollapsed"
        @navigate="navigateTo"
        @logout="handleLogout"
      />
    </aside>

    <SettingsDialog />
    <HistoryDialog v-if="historyDialog.isOpen.value" />

    <!-- Command Palette — mounted when search is open -->
    <StudioCommandPalette
      v-if="searchDialog.isOpen.value"
      :pages="pages"
      :layouts="layouts"
      :components="builderComponents"
      :is-loading="isLoading"
    />
  </div>
</template>

<style scoped>
.admin-sidebar-height {
  height: 100vh;
}

@supports (height: 100dvh) {
  .admin-sidebar-height {
    height: 100dvh;
  }
}

.studio-sidebar--animating {
  will-change: width;
}

:deep(.sidebar-nav-target.nav-border-inactive),
:deep(.sidebar-nav-target.hover\:nav-border-hover:hover) {
  box-shadow: inset 2px 0 0 0 transparent !important;
}
</style>

<style>
.agent-streaming {
  animation: sidebar-agent-pulse 1.2s ease-in-out infinite;
}

@keyframes sidebar-agent-pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.15);
  }
}
</style>
