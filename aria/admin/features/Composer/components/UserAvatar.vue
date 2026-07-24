<script setup lang="ts">
import { computed, type PropType } from "vue";
import { useStudioI18n } from "@/i18n";
import { studioIcons } from "@/lib/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { SessionUser } from "../../lib/auth/types";

const props = defineProps({
  user: {
    type: Object as PropType<SessionUser | null>,
    default: null,
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
});
const { t } = useStudioI18n();

const emit = defineEmits<{
  logout: [];
}>();

const displayName = computed(() => {
  return props.user?.username || t("composer.user.unknown");
});

function handleLogout(): void {
  emit("logout");
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        size="icon-sm"
        class="w-full h-8 hover:bg-accent/50"
        :disabled="isLoading"
      >
        <span
          :class="[studioIcons.userCircle, 'size-5']"
          :aria-label="t('composer.user.avatarAlt')"
        />
      </Button>
    </DropdownMenuTrigger>

    <DropdownMenuContent
      side="right"
      align="end"
      :side-offset="16"
      class="w-56 bg-sidebar border-dashed border-border rounded-sm"
    >
      <DropdownMenuLabel class="font-normal">
        <div class="flex flex-col space-y-1">
          <p class="text-sm font-medium leading-none">
            {{ displayName }}
          </p>
          <p class="text-xs leading-none text-muted-foreground">
            {{ user?.email }}
          </p>
        </div>
      </DropdownMenuLabel>

      <DropdownMenuSeparator class="bg-border" />

      <DropdownMenuItem class="text-xs" disabled>
        <div :class="[studioIcons.userLine, 'w-4 h-4 mr-2']" />
        <span>{{ t("composer.user.profile") }}</span>
        <span class="ml-auto text-xs text-muted-foreground">({{ t("composer.user.comingSoon") }})</span>
      </DropdownMenuItem>

      <DropdownMenuItem class="text-xs" disabled>
        <div :class="[studioIcons.shieldKeyhole, 'w-4 h-4 mr-2']" />
        <span>{{ t("composer.user.security") }}</span>
        <span class="ml-auto text-xs text-muted-foreground">({{ t("composer.user.comingSoon") }})</span>
      </DropdownMenuItem>

      <DropdownMenuItem
        class="text-xs text-destructive focus:text-destructive"
        @click="handleLogout"
      >
        <div :class="[studioIcons.signOut, 'w-4 h-4 mr-2']" />
        <span>{{ t("composer.user.logOut") }}</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
