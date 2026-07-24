<script setup lang="ts">
import {
  ref,
  computed,
  onMounted,
  defineAsyncComponent,
} from "vue";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import AriaIcon from "../../../assets/aria-icon.svg?url";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";
import { log } from "@/lib/utils/logger";
import {
  useAppRouter,
  type StudioSection as RouterStudioSection,
} from "../../Core";
import { useStudioComponentsBrowseState } from "../../Studio/composer/composables/useStudioComponentsBrowseState";
import { logoutUser, useUser } from "../../Auth";
import { HistoryPanel } from "../../History";
const UserAvatar = defineAsyncComponent(() => import("./UserAvatar.vue"));
import { useBuilderData } from "../../../composables/useBuilderData";

/**
 * ComposerNavBar - The w-12 left icon navigation spine
 */

// PROPS & EMITS

const emit = defineEmits<{
  "open-settings": [];
  "open-notifications": [];
  "open-help": [];
}>();
const { t } = useStudioI18n();

const appRouter = useAppRouter();
const componentsBrowseState = useStudioComponentsBrowseState();
const isHistoryOpen = ref(false);
const isUserAvatarMounted = ref(false);
const { user, isLoading: isLoadingUser, clearUser } = useUser();
const builderData = useBuilderData();

onMounted(() => {
  scheduleUserAvatarMount();
});

function handleSettingsClick(): void {
  emit("open-settings");
}

function scheduleUserAvatarMount(): void {
  if (typeof window === "undefined") return;

  if ("requestIdleCallback" in window) {
    (
      window as Window & { requestIdleCallback: (cb: () => void) => void }
    ).requestIdleCallback(() => {
      isUserAvatarMounted.value = true;
    });
    return;
  }

  setTimeout(() => {
    isUserAvatarMounted.value = true;
  }, 300);
}

interface NavItem {
  id: "studio" | "composer";
  icon: string; // UnoCSS class string
  label: string;
  section?: RouterStudioSection; // For studio sub-navigation
}

const navItems: NavItem[] = [
  {
    id: "studio",
    icon: studioIcons.dashboard,
    label: t("composer.nav.dashboard"),
    section: "dashboard",
  },
  {
    id: "studio",
    icon: studioIcons.studio,
    label: t("composer.nav.studio"),
    section: "pages",
  },
  {
    id: "composer",
    icon: studioIcons.composer,
    label: t("composer.nav.composer"),
  },
  {
    id: "studio",
    icon: studioIcons.design,
    label: t("composer.nav.design"),
    section: "design",
  },
  {
    id: "studio",
    icon: studioIcons.media,
    label: t("composer.nav.media"),
    section: "media",
  },
];

/**
 * Check if a nav item is active
 */
function isActive(item: NavItem): boolean {
  // Composer is active when editing
  if (item.id === "composer") {
    return appRouter.appMode.value === "stage";
  }

  // When editing, no other items should show active
  if (appRouter.isEditing.value) {
    return false;
  }

  const section = appRouter.studioSection.value;

  // Design icon active for all design sub-sections
  if (item.section === "design") {
    return (
      section === "design" ||
      ["colors", "typography", "breakpoints", "globals"].includes(section)
    );
  }

  // Studio icon active for all studio resource sections
  if (item.section === "pages") {
    return ["pages", "layouts", "components", "collections"].includes(section);
  }

  if (item.section) {
    return section === item.section;
  }

  return false;
}

/**
 * Handle navigation click
 */
function handleNavigate(item: NavItem): void {
  // Composer: start editing if not already
  if (item.id === "composer") {
    if (appRouter.appMode.value === "stage") return;
    const pages = builderData.pages.value;
    if (pages.length > 0) {
      appRouter.startEditing({
        itemType: "page",
        itemSlug: pages[0].slug,
      });
    } else {
      log("warn", "[ComposerNavBar] No pages available to start editing");
      appRouter.navigateToStudio("pages");
    }
    return;
  }

  if (item.id === "studio" && item.section) {
    if (item.section === "components") {
      componentsBrowseState.enterHome();
    }
    appRouter.navigateToStudio(item.section as RouterStudioSection);

    window.dispatchEvent(
      new CustomEvent("aria:navigate-to-section", {
        detail: item.section,
      }),
    );
  }
}

/**
 * Handle logo click (navigate to studio dashboard/home view)
 */
function handleLogoClick(): void {
  appRouter.navigateToStudio("dashboard");
}

/**
 * Handle logout
 * Calls the logout action and redirects to login page
 */
async function handleLogout(): Promise<void> {
  const result = await logoutUser();
  if ("error" in result) {
    log("error", "[ComposerNavBar] Logout error", {
      error: result.error,
    });
    return;
  }

  clearUser();
  window.location.href = "/admin/login";
}
</script>

<template>
  <nav class="w-12 flex flex-col items-center bg-sidebar shrink-0 z-20 py-4">
    <!-- Logo -->
    <div class="w-full pt-2 cursor-pointer" @click="handleLogoClick">
      <img
        :src="AriaIcon"
        alt="Aria"
        class="w-8 h-8 dark:invert mx-auto hover:fill-accent"
      />
    </div>

    <!-- Spacer -->
    <div class="flex-1" />

    <!-- Regular Navigation Items -->
    <div class="flex flex-col gap-3 w-full px-0">
      <TooltipProvider>
        <Tooltip v-for="item in navItems" :key="item.section || item.id">
          <TooltipTrigger as-child>
            <Button
              :variant="isActive(item) ? 'nav-active' : 'nav'"
              size="icon-sm"
              class="w-full h-8"
              @click="handleNavigate(item)"
            >
              <div :class="[item.icon, 'w-5 h-5']" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {{ item.label }}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>

    <!-- Spacer -->
    <div class="flex-1" />

    <!-- Bottom Section -->
    <div class="flex flex-col gap-2 w-full">
      <!-- History -->
      <TooltipProvider>
        <Tooltip>
          <Popover v-model:open="isHistoryOpen">
            <TooltipTrigger as-child>
              <PopoverTrigger as-child>
                <Button
                  variant="nav"
                  size="icon-sm"
                  class="w-full h-8 transition-all duration-150"
                >
                  <div :class="[studioIcons.transactionHistory, 'w-5 h-5']" />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="right"> {{ t("composer.nav.history") }} </TooltipContent>
            <PopoverContent
              side="right"
              align="center"
              :side-offset="9"
              class="w-70 p-0 mb-4 h-100 overflow-hidden bg-sidebar border-dashed border-border rounded-lg shadow-xl"
            >
              <Suspense>
                <template #default>
                  <HistoryPanel />
                </template>
                <template #fallback>
                  <div class="text-2xs text-muted-foreground">
                    Loading history…
                  </div>
                </template>
              </Suspense>
            </PopoverContent>
          </Popover>
        </Tooltip>
      </TooltipProvider>

      <!-- Settings -->
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              variant="nav"
              size="icon-sm"
              class="w-full h-9"
              @click="handleSettingsClick"
            >
              <div :class="[studioIcons.settings, 'w-5 h-5']" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right"> {{ t("composer.nav.settings") }} </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <!-- User Avatar -->
      <div v-if="!isUserAvatarMounted" class="w-full flex justify-center">
        <div class="w-8 h-8 rounded-full bg-sidebar animate-pulse" />
      </div>
      <Suspense v-else>
        <template #default>
          <UserAvatar
            :user="user"
            :is-loading="isLoadingUser"
            @logout="handleLogout"
          />
        </template>
        <template #fallback>
          <div class="w-full flex justify-center">
            <div class="w-8 h-8 rounded-full bg-sidebar animate-pulse" />
          </div>
        </template>
      </Suspense>
    </div>
  </nav>
</template>
