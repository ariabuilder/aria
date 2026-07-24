<script setup lang="ts">
import { useMediaQuery } from "@vueuse/core";
import { computed, onMounted, onUnmounted, ref } from "vue";
import type { ComponentPublicInstance } from "vue";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogScrollContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  useSettingsDialog,
  settingsTabGroups,
  settingsTabs,
  type SettingsTab,
} from "./composables/useSettingsDialog";
import { useAppearance } from "@/features/Design";
import { studioIcons } from "@/lib/icons";
import SettingsDialogContent from "./dialogs/SettingsDialogContent.vue";
import ResetSettingsTabDialog from "./dialogs/ResetSettingsTabDialog.vue";
import { useSlidingNavIndicator } from "@/features/Studio/core/composables/useSlidingNavIndicator";
import {
  FlickeringNavItem,
  SlidingNavIndicator,
} from "@/features/Studio/core/components";
import { resolveButtonEl } from "@/features/Studio/core/utils/resolveButtonEl";
import { isFeatureEnabled } from "@/lib/features";
import { useCapabilities } from "@/composables/useCapabilities";
import { useStudioI18n, type StudioMessageKey } from "@/i18n";

const dialog = useSettingsDialog();
const { reapply } = useAppearance();
const { hasCapability } = useCapabilities();
const { t } = useStudioI18n();

const isIntegrationsSurface = computed(
  () =>
    dialog.activeTab.value === "integrations" ||
    dialog.activeTab.value === "api",
);

function isNavTabActive(tabId: SettingsTab): boolean {
  if (tabId === "integrations") return isIntegrationsSurface.value;
  return dialog.activeTab.value === tabId;
}

const isMobile = useMediaQuery("(max-width: 767px)");

// Track whether the tab strip can scroll (has overflow)
const tabStripRef = ref<HTMLElement | null>(null);
const canScrollTabs = ref(false);

function checkTabOverflow() {
  const el = tabStripRef.value;
  if (el) {
    canScrollTabs.value = el.scrollWidth > el.clientWidth + 2;
  }
}

const tabLabelMap: Record<
  SettingsTab,
  { titleKey: StudioMessageKey; descriptionKey: StudioMessageKey }
> = {
  general: {
    titleKey: "settings.meta.general.title",
    descriptionKey: "settings.meta.general.description",
  },
  localization: {
    titleKey: "settings.meta.localization.title",
    descriptionKey: "settings.meta.localization.description",
  },
  appearance: {
    titleKey: "settings.meta.appearance.title",
    descriptionKey: "settings.meta.appearance.description",
  },
  seo: {
    titleKey: "settings.meta.seo.title",
    descriptionKey: "settings.meta.seo.description",
  },
  discovery: {
    titleKey: "settings.meta.discovery.title",
    descriptionKey: "settings.meta.discovery.description",
  },
  agent: {
    titleKey: "settings.meta.agent.title",
    descriptionKey: "settings.meta.agent.description",
  },
  mcp: {
    titleKey: "settings.meta.mcp.title",
    descriptionKey: "settings.meta.mcp.description",
  },
  api: {
    titleKey: "settings.meta.api.title",
    descriptionKey: "settings.meta.api.description",
  },
  integrations: {
    titleKey: "settings.meta.integrations.title",
    descriptionKey: "settings.meta.integrations.description",
  },
  redirects: {
    titleKey: "settings.meta.redirects.title",
    descriptionKey: "settings.meta.redirects.description",
  },
  analytics: {
    titleKey: "settings.meta.analytics.title",
    descriptionKey: "settings.meta.analytics.description",
  },
  "custom-code": {
    titleKey: "settings.meta.customCode.title",
    descriptionKey: "settings.meta.customCode.description",
  },
  users: {
    titleKey: "settings.meta.users.title",
    descriptionKey: "settings.meta.users.description",
  },
  security: {
    titleKey: "settings.meta.security.title",
    descriptionKey: "settings.meta.security.description",
  },
  email: {
    titleKey: "settings.meta.email.title",
    descriptionKey: "settings.meta.email.description",
  },
  "import-export": {
    titleKey: "settings.meta.importExport.title",
    descriptionKey: "settings.meta.importExport.description",
  },
  system: {
    titleKey: "settings.meta.system.title",
    descriptionKey: "settings.meta.system.description",
  },
};

const currentTabMeta = computed(() => {
  const tabId = isIntegrationsSurface.value
    ? "integrations"
    : dialog.activeTab.value;
  const meta = tabLabelMap[tabId];
  return {
    title: t(meta.titleKey),
    description: t(meta.descriptionKey),
  };
});

const isResetDialogOpen = ref(false);
const isResetting = ref(false);

const activeTabReset = computed(() =>
  dialog.getTabResetHandler(dialog.activeTab.value),
);

const canResetActiveTab = computed(() => activeTabReset.value != null);

async function confirmResetToDefaults(): Promise<void> {
  const handler = activeTabReset.value;
  if (!handler) {
    return;
  }

  isResetting.value = true;
  try {
    await handler.reset();
    toast.success(
      t("settings.resetSuccess", { title: currentTabMeta.value.title }),
    );
    isResetDialogOpen.value = false;
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : t("settings.resetFailed"),
    );
  } finally {
    isResetting.value = false;
  }
}

function isSettingsTabVisible(tabId: SettingsTab): boolean {
  if (tabId === "agent" || tabId === "mcp") {
    return (
      isFeatureEnabled("studio.agent") && hasCapability("viewAgentSettings")
    );
  }
  if (tabId === "integrations") {
    return (
      hasCapability("manageIntegrations") ||
      hasCapability("editCms") ||
      hasCapability("manageApiTokens")
    );
  }
  if (tabId === "email") {
    return hasCapability("viewEmailDelivery");
  }
  return true;
}

const visibleTabs = computed(() =>
  settingsTabs.filter((tab) => isSettingsTabVisible(tab.id)),
);

const visibleTabGroups = computed(() =>
  settingsTabGroups
    .map((group) => ({
      ...group,
      tabs: group.tabs.filter((tab) => isSettingsTabVisible(tab.id)),
    }))
    .filter((group) => group.tabs.length > 0),
);

const {
  navRef: settingsNavRef,
  indicator: navIndicator,
  indicatorAnimated: navIndicatorAnimated,
  registerButton: registerSettingsNavButton,
  onItemEnter: onNavItemEnter,
  onNavLeave,
  updateIndicator: updateNavIndicator,
} = useSlidingNavIndicator({
  enabled: computed(() => dialog.isOpen.value && !isMobile.value),
  activeKey: computed(() => dialog.activeTab.value),
});

function setTabButtonRef(
  tabId: SettingsTab,
  el: Element | ComponentPublicInstance | null,
) {
  registerSettingsNavButton(tabId, resolveButtonEl(el));
}

function handleOpenChange(open: boolean): void {
  if (open) {
    dialog.isOpen.value = true;
    return;
  }

  void dialog.close();
}

function countOpenOverlayDialogs(): number {
  return document.querySelectorAll('[role="dialog"][data-state="open"]').length;
}

function handleEscapeKey(event: KeyboardEvent): void {
  if (event.key !== "Escape" || !dialog.isOpen.value) {
    return;
  }

  // Let nested dialogs (media picker, slug prompt, etc.) handle Escape first.
  if (countOpenOverlayDialogs() > 1) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  void dialog.close();
}

onMounted(() => {
  window.addEventListener("keydown", handleEscapeKey, true);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleEscapeKey, true);
});
</script>

<template>
  <Dialog
    v-if="!isMobile"
    :open="dialog.isOpen.value"
    @update:open="handleOpenChange"
  >
    <DialogScrollContent
      lock-overlay-scroll
      preserve-on-theme-transition
      class="max-w-5xl! w-[85vw] h-[90vh] min-h-0 grid-rows-1 rounded-md overflow-hidden bg-sidebar"
    >
      <!-- Accessible title/description for screen readers -->
      <DialogTitle class="sr-only">{{ t("settings.title") }}</DialogTitle>
      <DialogDescription class="sr-only">{{
        t("settings.description")
      }}</DialogDescription>
      <div class="flex h-full min-h-0 overflow-hidden">
        <!-- Left: tab sidebar -->
        <aside class="w-52 shrink-0 flex flex-col mb-2">
          <div class="px-6 mt-2 py-3">
            <h2
              class="text-2xl font-serif font-medium text-foreground leading-2"
            >
              {{ t("settings.title") }}
            </h2>
            <p class="text-sm text-muted-foreground leading-2 pb-1">
              {{ t("settings.description") }}
            </p>
          </div>

          <nav
            ref="settingsNavRef"
            class="settings-nav relative flex-1 overflow-y-auto py-5"
            role="tablist"
            :aria-label="t('settings.categories')"
            @scroll="updateNavIndicator"
            @mouseleave="onNavLeave"
          >
            <SlidingNavIndicator
              :visible="navIndicator.visible"
              :top="navIndicator.top"
              :height="navIndicator.height"
              :animated="navIndicatorAnimated"
            />

            <div
              v-for="group in visibleTabGroups"
              :key="group.id"
              class="settings-nav-group"
            >
              <div
                class="settings-nav-heading text-muted-foreground/40 px-6 pb-1"
              >
                {{ t(group.labelKey) }}
              </div>

              <FlickeringNavItem
                v-for="tab in group.tabs"
                :key="tab.id"
                :ref="(el) => setTabButtonRef(tab.id, el)"
                :id="`settings-tab-${tab.id}`"
                role="tab"
                :aria-selected="isNavTabActive(tab.id)"
                :aria-controls="`settings-panel-${tab.id}`"
                :active="isNavTabActive(tab.id)"
                :show-grid="false"
                class="settings-nav-row min-h-8.5! px-6! py-0! text-sm"
                :class="isNavTabActive(tab.id) ? 'text-primary!' : ''"
                @click="dialog.activeTab.value = tab.id"
                @mouseenter="onNavItemEnter(tab.id)"
              >
                {{ t(tab.labelKey) }}
              </FlickeringNavItem>
            </div>
          </nav>
        </aside>

        <!-- Right: content area -->
        <div
          class="flex flex-1 min-h-0 flex-col overflow-hidden bg-background my-1.5 mr-1.5 rounded-sm border border-border border-solid shadow-none z-10"
        >
          <div
            class="relative flex items-center justify-between px-7 pt-3 pb-2 shrink-0 border-b border-border border-dashed"
          >
            <template v-if="!dialog.isHeaderOverridden.value">
              <div>
                <h3
                  class="text-md font-serif font-medium text-foreground leading-0"
                >
                  {{ currentTabMeta.title }}
                </h3>
                <p class="text-sm text-muted-foreground mt-0.5 leading-tight">
                  {{ currentTabMeta.description }}
                </p>
              </div>
            </template>
            <div v-else class="invisible" aria-hidden="true">
              <h3
                class="text-md font-serif font-medium text-foreground leading-0"
              >
                {{ currentTabMeta.title }}
              </h3>
              <p class="text-sm text-muted-foreground mt-0.5 leading-tight">
                {{ currentTabMeta.description }}
              </p>
            </div>
            <div
              v-if="dialog.isHeaderOverridden.value"
              id="settings-tab-header"
              class="absolute inset-y-0 left-7 flex items-center"
            ></div>
            <div
              id="settings-tab-actions"
              class="flex items-center gap-2"
            ></div>
          </div>

          <div
            class="flex-1 min-h-0 overflow-y-auto overscroll-y-contain [overflow-anchor:none]"
            :class="
              dialog.activeTab.value === 'import-export' ||
              dialog.activeTab.value === 'email' ||
              dialog.activeTab.value === 'agent' ||
              isIntegrationsSurface ||
              dialog.activeTab.value === 'discovery' ||
              dialog.activeTab.value === 'redirects' ||
              (dialog.activeTab.value === 'users' &&
                dialog.isHeaderOverridden.value)
                ? 'pt-0'
                : 'pt-4'
            "
          >
            <div
              :id="`settings-panel-${dialog.activeTab.value}`"
              role="tabpanel"
              :aria-labelledby="`settings-tab-${dialog.activeTab.value}`"
            >
              <SettingsDialogContent :active-tab="dialog.activeTab.value" />
            </div>
          </div>

          <div
            v-if="!isIntegrationsSurface"
            class="flex items-center justify-between px-3 py-3 shrink-0"
          >
            <div id="settings-tab-footer-left" class="flex items-center">
              <Button
                v-if="
                  dialog.activeTab.value !== 'localization' && canResetActiveTab
                "
                variant="ghost-outline"
                size="xs"
                class="text-muted-foreground hover:text-foreground"
                :disabled="isResetting"
                @click="isResetDialogOpen = true"
              >
                {{ t("common.resetToDefaults") }}
              </Button>
            </div>
            <div
              id="settings-tab-footer-actions"
              class="flex items-center gap-3"
            >
              <template v-if="dialog.activeTab.value !== 'localization'">
                <Button variant="secondary" size="md" @click="dialog.close()">
                  {{ t("common.cancel") }}
                </Button>
                <Button
                  variant="default"
                  size="md"
                  @click="
                    reapply();
                    dialog.close();
                  "
                >
                  {{ t("common.save") }}
                </Button>
              </template>
            </div>
          </div>
        </div>
      </div>
    </DialogScrollContent>
  </Dialog>

  <Sheet v-else :open="dialog.isOpen.value" @update:open="handleOpenChange">
    <SheetContent
      side="bottom"
      preserve-on-theme-transition
      class="!max-h-[85dvh] !p-0 !gap-0 flex flex-col rounded-t-2xl"
    >
      <!-- Drag indicator -->
      <div class="shrink-0 flex justify-center pt-2 pb-1">
        <div class="w-10 h-1 rounded-full bg-muted-foreground/30" />
      </div>

      <!-- Header -->
      <div class="shrink-0 px-5 pb-3">
        <div class="flex items-start justify-between gap-3">
          <template v-if="!dialog.isHeaderOverridden.value">
            <div class="min-w-0">
              <h3 class="text-base font-semibold text-foreground">
                {{ currentTabMeta.title }}
              </h3>
              <p class="text-xs text-muted-foreground mt-0.5">
                {{ currentTabMeta.description }}
              </p>
            </div>
          </template>
          <div v-else id="settings-tab-header"></div>
          <div
            id="settings-tab-actions"
            class="flex shrink-0 items-center gap-2"
          ></div>
        </div>
      </div>

      <!--
        Scrollable content — uses min-height so the sheet stays
        the same size across tabs with different content lengths.
      -->
      <div class="flex-1 overflow-y-auto px-5 min-h-[40vh]">
        <div
          :id="`settings-panel-${dialog.activeTab.value}`"
          role="tabpanel"
          :aria-labelledby="`settings-tab-${dialog.activeTab.value}`"
        >
          <SettingsDialogContent :active-tab="dialog.activeTab.value" />
        </div>
      </div>

      <!--
        Tab selector strip — sidebar-influenced styling with left-border
        active state instead of pill badges. Positioned at the bottom,
        thumb-reachable, with an overflow arrow on the right when needed.
      -->
      <div class="shrink-0 border-t border-border/50 pt-1 pb-2 bg-background">
        <div class="relative">
          <div
            ref="tabStripRef"
            role="tablist"
            :aria-label="t('settings.categories')"
            class="flex items-stretch gap-0 overflow-x-auto scrollbar-none px-3"
            @vue:mounted="checkTabOverflow"
            @scroll="checkTabOverflow"
          >
            <button
              v-for="tab in visibleTabs"
              :key="tab.id"
              :id="`settings-tab-${tab.id}`"
              role="tab"
              :aria-selected="isNavTabActive(tab.id)"
              :aria-controls="`settings-panel-${tab.id}`"
              class="nav-border-inactive shrink-0 px-3 py-2.5 text-left text-xs font-serif transition-all duration-200 border-b border-border/50 hover:nav-border-hover hover:text-sidebar-primary"
              :class="
                isNavTabActive(tab.id)
                  ? 'nav-border-active text-foreground font-bold'
                  : 'text-muted-foreground'
              "
              @click="dialog.activeTab.value = tab.id"
            >
              {{ t(tab.labelKey) }}
            </button>
          </div>

          <!-- Scroll hint arrow — fades in when tabs overflow -->
          <div
            v-if="canScrollTabs"
            class="pointer-events-none absolute top-0 right-0 bottom-0 w-12 bg-gradient-to-l from-background to-transparent flex items-center justify-end pr-1"
          >
            <span
              :class="[
                studioIcons.chevronRight,
                'size-3.5 text-muted-foreground/60',
              ]"
            />
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div
        v-if="!isIntegrationsSurface"
        class="shrink-0 px-7 py-3 flex items-center justify-between gap-3 border-t border-border"
      >
        <div id="settings-tab-footer-left" class="flex items-center">
          <Button
            v-if="
              dialog.activeTab.value !== 'localization' && canResetActiveTab
            "
            variant="ghost-outline"
            size="sm"
            :disabled="isResetting"
            @click="isResetDialogOpen = true"
          >
            {{ t("common.resetToDefaults") }}
          </Button>
        </div>
        <div id="settings-tab-footer-actions" class="flex items-center gap-3">
          <template v-if="dialog.activeTab.value !== 'localization'">
            <Button variant="destructive" size="sm" @click="dialog.close()">
              {{ t("common.cancel") }}
            </Button>
            <Button
              variant="default"
              size="sm"
              @click="
                reapply();
                dialog.close();
              "
            >
              {{ t("common.saveChanges") }}
            </Button>
          </template>
        </div>
      </div>
    </SheetContent>
  </Sheet>

  <ResetSettingsTabDialog
    v-if="activeTabReset"
    :open="isResetDialogOpen"
    :title="activeTabReset.title"
    :description="activeTabReset.description"
    :warning="activeTabReset.warning"
    :items="activeTabReset.items"
    :confirm-label="activeTabReset.confirmLabel"
    :is-confirming="isResetting"
    @update:open="isResetDialogOpen = $event"
    @confirm="confirmResetToDefaults"
  />
</template>

<style scoped>
.settings-nav-item.nav-border-inactive,
.settings-nav-item.hover\:nav-border-hover:hover,
.sidebar-nav-target.nav-border-inactive,
.sidebar-nav-target.hover\:nav-border-hover:hover {
  box-shadow: inset 2px 0 0 0 transparent !important;
}

.scrollbar-none {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.scrollbar-none::-webkit-scrollbar {
  display: none;
}

.settings-nav-group + .settings-nav-group {
  margin-top: 1.5rem;
}

.settings-nav-heading {
  font-size: 0.625rem;
  font-weight: 600;
  line-height: 1;
  text-transform: uppercase;
}

:deep(.settings-nav-row) {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  border: 0 !important;
  line-height: 1;
}
</style>
