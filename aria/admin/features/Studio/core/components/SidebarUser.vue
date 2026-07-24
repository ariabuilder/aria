<script setup lang="ts">
import { computed } from "vue";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useUser } from "@/features/Auth/composables/useUser";
import { resolveUserPermissionProfile } from "../../../../../lib/authorship/permissionProfile";
import { studioIcons } from "@/lib/icons";
import SidebarUserMenu from "./SidebarUserMenu.vue";
import { useStudioI18n } from "@/i18n";

const props = defineProps<{
  collapsed: boolean;
}>();

const emit = defineEmits<{
  navigate: [path: string];
  logout: [];
}>();

const { user, isLoading } = useUser();
const { t } = useStudioI18n();

function userInitial(): string {
  if (isLoading.value) return "";
  if (!user.value?.username) return "?";
  return user.value.username.charAt(0).toUpperCase();
}

function displayName(): string {
  if (isLoading.value) return t("common.loading");
  if (!user.value) return t("common.notSignedIn");
  return user.value.username;
}

function displayRole(): string {
  if (isLoading.value) return "";
  if (!user.value) return "";
  const profile = resolveUserPermissionProfile(user.value);
  switch (profile.rolePreset) {
    case "administrator":
      return t("sidebar.role.administrator");
    case "manager":
      return t("sidebar.role.manager");
    case "content-editor":
      return t("sidebar.role.contentEditor");
    case "contributor":
      return t("sidebar.role.contributor");
  }
}

function triggerButtonClasses(): string {
  const base =
    "h-auto rounded-sm text-sm font-normal transition-colors focus-visible:outline-none";
  const expandedInteractive =
    "hover:bg-background/70 hover:text-foreground data-[state=open]:bg-background/70 data-[state=open]:text-foreground focus-visible:bg-background/70 focus-visible:text-foreground";

  if (props.collapsed) {
    return `${base} flex w-full items-center justify-center py-1.5`;
  }
  return `${base} ${expandedInteractive} flex items-center w-full !justify-start gap-3 px-2 py-1.5`;
}

const popoverSide = computed<"top" | "right">(() =>
  props.collapsed ? "right" : "top",
);
const popoverAlign = computed<"start" | "end">(() =>
  props.collapsed ? "end" : "start",
);
const popoverContentClass = computed(() =>
  props.collapsed
    ? "mx-4 w-60 rounded-md shadow-lg border border-border/50 border-solid"
    : "rounded-md w-56 border border-border border-solid",
);
</script>

<template>
  <div :class="collapsed ? 'pt-2 pb-0' : 'px-2 py-3'">
    <Popover>
      <PopoverTrigger as-child>
        <button :class="triggerButtonClasses()" :disabled="isLoading">
          <!-- Avatar / initial -->
          <div
            :class="[
              'flex shrink-0 items-center justify-center rounded-sm overflow-hidden border border-border/50 hover:border-solid border-dashed hover:brightness-120 transition-all duration-100 hover:border-border/50',
              collapsed ? 'size-8.5' : 'aspect-square size-9.5',
              !user?.avatarUrl ? 'bg-background text-foreground' : '',
            ]"
          >
            <img
              v-if="user?.avatarUrl"
              :key="user.avatarUrl ?? ''"
              :src="user.avatarUrl"
              alt=""
              class="size-full object-cover"
            />
            <span
              v-else-if="isLoading"
              :class="[studioIcons.loading, 'size-4 animate-spin']"
            />
            <span
              v-else
              :class="
                collapsed ? 'text-base font-medium' : 'text-sm font-medium'
              "
            >
              {{ userInitial() }}
            </span>
          </div>

          <!-- Name + role (expanded only) -->
          <div
            v-if="!collapsed"
            class="grid flex-1 text-left text-sm leading-tight"
          >
            <span class="truncate font-medium capitalize text-foreground">{{
              displayName()
            }}</span>
            <span class="truncate text-xs text-muted-foreground">{{
              displayRole()
            }}</span>
          </div>
        </button>
      </PopoverTrigger>

      <PopoverContent
        :side="popoverSide"
        :align="popoverAlign"
        :class="popoverContentClass"
      >
        <SidebarUserMenu
          :user="user"
          :is-loading="isLoading"
          @navigate="emit('navigate', $event)"
          @logout="emit('logout')"
        />
      </PopoverContent>
    </Popover>
  </div>
</template>
