<script setup lang="ts">
import { computed } from "vue";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { isSessionUserId } from "@/features/Auth/composables/useUser";
import { useStudioLive } from "./useStudioLive";
import type { StudioPresenceAttachment } from "@/lib/realtime/studioLive";

const props = defineProps<{
  resourceType: "page" | "component" | "layout";
  resourceId: string | null | undefined;
  resourceLabel: string;
}>();

const { sessions } = useStudioLive();

const editors = computed(() => {
  const resourceId = props.resourceId?.trim();
  if (!resourceId) return [];

  const byUser = new Map<string, StudioPresenceAttachment>();
  for (const session of sessions.value) {
    if (
      isSessionUserId(session.userId) ||
      session.resourceType !== props.resourceType ||
      session.resourceId !== resourceId ||
      session.state !== "editing"
    ) {
      continue;
    }

    const existing = byUser.get(session.userId);
    if (!existing || (!existing.dirty && session.dirty)) {
      byUser.set(session.userId, session);
    }
  }

  return [...byUser.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  );
});

const message = computed(() => {
  const names = editors.value.map((editor) => editor.displayName);
  if (names.length === 1) {
    return `${names[0]} is currently editing this ${props.resourceLabel}`;
  }
  if (names.length === 2) {
    return `${names[0]} and ${names[1]} are currently editing this ${props.resourceLabel}`;
  }
  return `${names[0]}, ${names[1]}, and ${names.length - 2} others are currently editing this ${props.resourceLabel}`;
});
</script>

<template>
  <Transition name="banner-slide">
    <div
      v-if="editors.length"
      data-testid="studio-presence-notice"
      class="flex shrink-0 items-center gap-2 border-b border-amber-500/20 bg-amber-500/8 px-5 py-2 text-xs text-foreground"
      role="status"
      aria-live="polite"
    >
      <div class="flex -space-x-1.5" aria-hidden="true">
        <Avatar
          v-for="editor in editors.slice(0, 3)"
          :key="editor.userId"
          class="size-5 border border-background"
        >
          <AvatarImage v-if="editor.avatarUrl" :src="editor.avatarUrl" />
          <AvatarFallback class="text-[9px] font-semibold">
            {{ editor.displayName.charAt(0).toUpperCase() }}
          </AvatarFallback>
        </Avatar>
      </div>
      <span class="size-1.5 shrink-0 rounded-full bg-amber-500" />
      <span class="truncate">{{ message }}</span>
    </div>
  </Transition>
</template>
