<script setup lang="ts">
import { computed } from "vue";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";
import type { ActivityTimelineItem } from "../types/activityTimeline";

const props = withDefaults(
  defineProps<{
    items: readonly ActivityTimelineItem[];
    isLoading?: boolean;
    error?: string | null;
    maxItems?: number;
    title?: string;
  }>(),
  {
    isLoading: false,
    error: null,
    maxItems: 5,
    title: "",
  },
);

const emit = defineEmits<{
  action: [itemId: string, actionId: string];
}>();
const { t } = useStudioI18n();
const displayTitle = computed(() => props.title || t("activity.title"));

const visibleItems = computed(() =>
  props.items.slice(0, props.maxItems),
);

function userInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}

function displayActivityAction(action: string): string {
  const key = action.trim().toLowerCase();
  const keys = new Set([
    "created", "published", "scheduled", "archived", "unpublished",
    "restored", "duplicated", "updated", "saved",
  ]);
  return keys.has(key) ? t(`activity.action.${key}`) : action;
}

function displayActivityTarget(target: string): string {
  const keyByTarget: Record<string, string> = {
    "this entry": "entry",
    "this page": "page",
    content: "content",
    "a revision": "revision",
  };
  const key = keyByTarget[target.trim().toLowerCase()];
  return key ? t(`activity.target.${key}`) : target;
}

function displayActionLabel(label: string): string {
  if (label === "Restore revision") return t("activity.restoreRevision");
  if (label === "Delete revision") return t("activity.deleteRevision");
  return label;
}

function isHighlightedItem(
  item: ActivityTimelineItem,
  index: number,
): boolean {
  return item.isHighlighted ?? index === 0;
}

function isPublishedActivity(action: string): boolean {
  return action.trim().toLowerCase() === "published";
}

type LatestAccent = "published" | "latest";

function latestAccent(
  item: ActivityTimelineItem,
  index: number,
): LatestAccent | null {
  if (!isHighlightedItem(item, index)) {
    return null;
  }
  return isPublishedActivity(item.action) ? "published" : "latest";
}

function dotClass(item: ActivityTimelineItem, index: number): string {
  const accent = latestAccent(item, index);
  if (accent === "published") {
    return "size-2.5 bg-emerald-500 ring-4 ring-emerald-500/15";
  }
  if (accent === "latest") {
    return "size-2.5 bg-secondary ring-4 ring-secondary/15";
  }
  return "size-2 bg-muted-foreground/25";
}

function railSegmentClass(
  item: ActivityTimelineItem,
  index: number,
): string {
  const accent = latestAccent(item, index);
  if (accent === "published") {
    return "bg-primary";
  }
  if (accent === "latest") {
    return "bg-[color-mix(in_srgb,var(--secondary)_40%,transparent)]";
  }
  return "bg-border";
}
</script>

<template>
  <section
    class="overflow-hidden rounded-sm border border-solid border-border/50 bg-card/40"
  >
    <header class="flex items-baseline justify-between gap-3 px-5 pt-5 pb-1.5">
      <h2 class="m-0 min-w-0 text-sm font-semibold text-foreground">
        {{ displayTitle }}
      </h2>
    </header>

    <p v-if="error" class="m-0 px-0.5 pb-2 text-xs text-destructive">
      {{ error }}
    </p>

    <div v-if="isLoading" class="relative m-0 p-0">
      <div
        v-for="index in 3"
        :key="index"
        class="relative flex gap-3 py-2 pl-5"
      >
        <div
          v-if="index < 3"
          class="pointer-events-none absolute top-[1.5rem] left-[0.4375rem] h-full w-px -translate-x-1/2 bg-border/80"
          aria-hidden="true"
        />

        <div
          class="absolute top-[1.5rem] left-[0.4375rem] z-10 -translate-x-1/2 -translate-y-1/2 rounded-full animate-pulse"
          :class="
            index === 0
              ? 'size-2.5 bg-secondary/80 ring-4 ring-secondary/20'
              : 'size-2 bg-border/40'
          "
          aria-hidden="true"
        />

        <div
          class="relative z-10 size-8 shrink-0 rounded-full bg-card/40 animate-pulse"
        />
        <div class="relative z-10 min-w-0 flex-1 space-y-1.5 pt-0.5">
          <div class="h-3 w-44 max-w-full rounded bg-card/40 animate-pulse" />
          <div class="h-2.5 w-28 rounded bg-card/40 animate-pulse" />
        </div>
      </div>
    </div>

    <p
      v-else-if="visibleItems.length === 0"
      class="m-0 py-8 text-center text-xs text-muted-foreground"
    >
      {{ t("activity.empty") }}
    </p>

    <ol v-else class="relative m-0 list-none pl-7 pr-2 pb-3 pt-1.5">
      <li
        v-for="(item, index) in visibleItems"
        :key="item.id"
        class="group relative flex gap-5 py-2.5 pl-5"
      >
        <div
          v-if="index < visibleItems.length - 1"
          class="pointer-events-none absolute top-[1.5rem] left-[0.4375rem] h-full w-px -translate-x-1/2"
          :class="railSegmentClass(item, index)"
          aria-hidden="true"
        />

        <div
          class="absolute top-[1.5rem] left-[0.4375rem] z-10 -translate-x-1/2 -translate-y-1/2 rounded-full"
          :class="dotClass(item, index)"
          aria-hidden="true"
        />

        <Avatar class="ml-2 relative z-10 size-8 shrink-0">
          <AvatarImage
            v-if="item.userAvatarUrl"
            :src="item.userAvatarUrl"
            :alt="item.userName"
          />
          <AvatarFallback
            class="bg-muted text-2xs font-medium text-muted-foreground"
          >
            {{ userInitial(item.userName) }}
          </AvatarFallback>
        </Avatar>

        <div class="relative z-10 min-w-0 flex-1 pr-7">
          <p class="m-0 text-sm leading-snug">
            <span class="font-semibold text-foreground">{{ item.userName }}</span>
            <span class="text-muted-foreground">
              {{ " " }}{{ displayActivityAction(item.action) }} {{ displayActivityTarget(item.target) }}
            </span>
          </p>
          <p class="m-0 mt-0.5 text-xs leading-snug text-muted-foreground">
            {{ item.timestamp }}
          </p>
        </div>

        <DropdownMenu v-if="item.actions?.length">
          <DropdownMenuTrigger as-child>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              class="absolute top-2 right-0 z-10 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
              :aria-label="t('activity.actionsFor', { user: item.userName })"
            >
              <span :class="[studioIcons.moreVertical, 'size-4']" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-44">
            <template
              v-for="(action, actionIndex) in item.actions"
              :key="action.id"
            >
              <DropdownMenuItem
                class="cursor-pointer text-xs"
                :class="
                  action.destructive
                    ? 'text-destructive focus:text-destructive'
                    : undefined
                "
                :disabled="action.disabled"
                :title="action.disabled ? action.disabledReason : undefined"
                @select="emit('action', item.id, action.id)"
              >
                {{ displayActionLabel(action.label) }}
              </DropdownMenuItem>
            </template>
          </DropdownMenuContent>
        </DropdownMenu>
      </li>
    </ol>
  </section>
</template>
