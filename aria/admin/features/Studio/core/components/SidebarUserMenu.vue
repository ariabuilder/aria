<script setup lang="ts">
import type { SessionUser } from "@/lib/auth/types";
import { resolveUserPermissionProfile } from "../../../../../lib/authorship/permissionProfile";
import { Button } from "@/components/ui/button";
import { studioIcons } from "@/lib/icons";
import { useSettingsDialog } from "@/features/Studio/settings/composables/useSettingsDialog";
import { useStudioI18n } from "@/i18n";

const settingsDialog = useSettingsDialog();
const { t } = useStudioI18n();

withDefaults(
  defineProps<{
    user?: SessionUser | null;
    isLoading?: boolean;
  }>(),
  {
    user: null,
    isLoading: false,
  },
);

const emit = defineEmits<{
  navigate: [path: string];
  logout: [];
}>();

const itemClass =
  "w-full !justify-start gap-2! rounded-sm overflow-hidden px-2.5 py-1 h-auto text-sm font-regular leading-snug transition-colors";

function sessionRoleLabel(sessionUser: SessionUser | null | undefined): string {
  if (!sessionUser) return "";
  const profile = resolveUserPermissionProfile(sessionUser);
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
</script>

<template>
  <div class="flex flex-col mx-1 my-0.5">
    <!-- Identity
         ═════════════════════════════════════════════════════════════════ -->
    <div class="px-3 pt-2.5 pb-2 select-none overflow-hidden">
      <p class="m-0 truncate capitalize text-foreground text-sm font-medium leading-none">
        <template v-if="isLoading">{{ t("common.loading") }}</template>
        <template v-else>{{ user?.username ?? t("common.notSignedIn") }}</template>
      </p>

      <!-- Role -->
      <p
        v-if="!isLoading && user"
        class="m-0 pt-0.5 truncate text-xs text-muted-foreground leading-relaxed"
      >
        {{ sessionRoleLabel(user) }}
      </p>
    </div>

    <!-- Actions
         ═════════════════════════════════════════════════════════════════ -->
    <div
      class="mb-0.5 px-1 py-1 space-y-0 rounded-sm bg-sidebar border-0.5 border-border"
    >
      <!-- Profile -->
      <Button
        v-if="user"
        variant="ghost"
        size="xs"
        :class="itemClass + ' hover:bg-background/70 hover:text-foreground'"
        @click="settingsDialog.open('users', user.id)"
      >
        <span :class="[studioIcons.user, 'size-4 shrink-0 text-muted-foreground']" />
        <span>{{ t("sidebar.profile") }}</span>
      </Button>

      <!-- History -->
      <Button
        variant="ghost"
        size="xs"
        :class="itemClass + ' hover:bg-background/70 hover:text-foreground'"
        @click="emit('navigate', '/history')"
      >
        <span :class="[studioIcons.history, 'size-4 shrink-0 text-muted-foreground']" />
        <span>{{ t("sidebar.history") }}</span>
      </Button>

      <!-- Log out -->
      <Button
        variant="ghost"
        size="xs"
        :class="itemClass + ' hover:bg-background/70 hover:text-foreground'"
        @click="emit('logout')"
      >
        <span :class="[studioIcons.logout, 'size-4 shrink-0 text-muted-foreground']" />
        <span>{{ t("sidebar.logOut") }}</span>
      </Button>
    </div>
  </div>
</template>
