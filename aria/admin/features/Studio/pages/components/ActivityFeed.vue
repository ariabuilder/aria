<script setup lang="ts">
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { studioIcons } from "@/lib/icons";

/**
 * Represents a single activity entry from the page version history.
 */
export interface ActivityItem {
  id: string;
  userId: string;
  /** Display name of the user who performed the action */
  userName: string;
  userAvatar?: string;
  /** Human-readable past tense action (e.g. "published", "edited", "created") */
  action: string;
  /** The target of the action (e.g. "this page", "Hero Section", "meta description") */
  target: string;
  /** Relative timestamp string (e.g. "2h ago", "5h ago") */
  timestamp: string;
}

/**
 * Props for the ActivityFeed component.
 * Shows recent page activity from the version history.
 */
interface Props {
  activities: ActivityItem[];
  isLoading?: boolean;
  showViewAll?: boolean;
}

/**
 * Emits for user interactions with the activity feed.
 */
interface Emits {
  /** Emitted when the user clicks "View all history" */
  "view-all": [];
}

const props = withDefaults(defineProps<Props>(), {
  isLoading: false,
  showViewAll: true,
});

const emit = defineEmits<Emits>();
</script>

<template>
  <div class="rounded-sm border border-solid border-border/50 bg-card/40">
    <div class="px-4 py-3 border-b border-border">
      <h3 class="text-sm font-medium text-foreground">Recent Activity</h3>
    </div>

    <div v-if="isLoading" class="space-y-3 px-4 py-4">
      <div
        v-for="i in 3"
        :key="i"
        class="flex items-start gap-3"
      >
        <div class="size-6 shrink-0 rounded-full bg-muted/40 animate-pulse" />
        <div class="flex-1 space-y-2">
          <div class="h-3 w-40 rounded bg-muted/40 animate-pulse" />
          <div class="h-2.5 w-16 rounded bg-muted/30 animate-pulse" />
        </div>
      </div>
    </div>

    <div v-else-if="activities.length === 0" class="px-4 py-6 text-center">
      <p class="text-xs text-muted-foreground">No activity yet</p>
    </div>

    <div v-else class="divide-y divide-border/30">
      <div
        v-for="activity in activities.slice(0, 5)"
        :key="activity.id"
        class="flex items-start gap-3 px-4 py-3"
      >
        <Avatar class="size-6 shrink-0">
          <AvatarImage v-if="activity.userAvatar" :src="activity.userAvatar" />
          <AvatarFallback class="text-2xs">{{ activity.userName.charAt(0).toUpperCase() }}</AvatarFallback>
        </Avatar>

        <div class="min-w-0 flex-1">
          <p class="text-xs text-foreground">
            <span class="font-medium">{{ activity.userName }}</span>
            {{ activity.action }}
            <span class="text-muted-foreground">{{ activity.target }}</span>
          </p>
          <span class="text-2xs text-muted-foreground">{{ activity.timestamp }}</span>
        </div>
      </div>
    </div>

    <div v-if="showViewAll && activities.length > 5" class="px-4 py-2 border-t border-border">
      <Button
        variant="ghost"
        size="sm"
        class="w-full text-xs"
        @click="emit('view-all')"
      >
        View all history
        <span :class="[studioIcons.externalLink, 'size-3 ml-1']" />
      </Button>
    </div>
  </div>
</template>
