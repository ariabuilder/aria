<script setup lang="ts">
import { computed, ref } from "vue";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ActorRef } from "../../../../../lib/auth/types";
import { formatActorDisplayName } from "../../../../../lib/authorship/reads";
import { studioIcons } from "@/lib/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { normalizeStoredVersion } from "../../../../../lib/storage/pageVersionDelete";
import { getVersionAuthorshipLabel } from "../utils/versionAuthorshipLabels";
import { formatVersionTimestampLine } from "../utils/versionHistoryFormatters";
import { useStudioI18n } from "@/i18n";

export interface HistoryEntry {
  version: string;
  displayVersion: number;
  createdAt: string;
  createdBy?: ActorRef;
  authorName?: string;
  activity: {
    action: string;
    userName: string;
    target: string;
  } | null;
}

interface Props {
  entries: HistoryEntry[];
  isLoading?: boolean;
  canRestore?: boolean;
  isRestoring?: boolean;
  canDelete?: boolean;
  isDeleting?: boolean;
  protectedVersions?: string[];
}

interface Emits {
  revert: [version: string];
  delete: [version: string];
}

const props = withDefaults(defineProps<Props>(), {
  isLoading: false,
  canRestore: true,
  isRestoring: false,
  canDelete: false,
  isDeleting: false,
  protectedVersions: () => [],
});

const emit = defineEmits<Emits>();
const { t } = useStudioI18n();

const openPopoverVersion = ref<string | null>(null);

function actorDisplayName(entry: HistoryEntry): string {
  if (entry.createdBy) {
    return formatActorDisplayName(entry.createdBy);
  }
  if (entry.authorName?.trim()) {
    return entry.authorName.trim();
  }
  if (entry.activity?.userName?.trim()) {
    return entry.activity.userName.trim();
  }
  return t("pages.history.unknown");
}

function actorInitial(entry: HistoryEntry): string {
  const name = actorDisplayName(entry);
  if (name === t("pages.history.unknown")) return "?";
  return name.charAt(0).toUpperCase();
}

function isCurrent(index: number): boolean {
  return index === 0;
}

function isPopoverOpen(version: string): boolean {
  return openPopoverVersion.value === version;
}

function onPopoverOpenChange(version: string, open: boolean): void {
  openPopoverVersion.value = open ? version : null;
}

function closePopover(): void {
  openPopoverVersion.value = null;
}

function confirmRestore(version: string): void {
  closePopover();
  emit("revert", version);
}

const protectedVersionSet = computed(
  () =>
    new Set(
      props.protectedVersions.map((version) => normalizeStoredVersion(version)),
    ),
);

function isProtectedVersion(version: string): boolean {
  return protectedVersionSet.value.has(normalizeStoredVersion(version));
}

function canDeleteEntry(index: number, version: string): boolean {
  if (!props.canDelete || isCurrent(index)) {
    return false;
  }
  return !isProtectedVersion(version);
}

function deleteDisabledReason(version: string): string {
  if (isProtectedVersion(version)) {
    return t("pages.history.deleteProtected");
  }
  return t("pages.history.deleteUnavailable");
}

function hasRowActions(index: number): boolean {
  if (isCurrent(index)) {
    return false;
  }
  return Boolean(props.canRestore || props.canDelete);
}

const historyBusy = computed(
  () => props.isRestoring || props.isDeleting,
);
</script>

<template>
  <section class="space-y-3">
    <div class="flex h-9 items-center justify-between">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {{ t("pages.history.revisions") }}
      </h2>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="space-y-1">
      <div
        v-for="i in 3"
        :key="i"
        class="flex h-12 items-center gap-3 rounded-md px-2"
      >
        <div class="size-8 shrink-0 rounded-full bg-muted/40 animate-pulse" />
        <div class="flex-1 space-y-2">
          <div class="h-3.5 w-32 rounded bg-muted/40 animate-pulse" />
          <div class="h-3 w-48 rounded bg-muted/30 animate-pulse" />
        </div>
      </div>
    </div>

    <!-- Empty -->
    <div
      v-else-if="entries.length === 0"
      class="flex h-20 items-center text-sm text-muted-foreground"
    >
      {{ t("pages.history.empty") }}
    </div>

    <!-- Timeline -->
    <div v-else class="space-y-1">
      <div
        v-for="(entry, index) in entries"
        :key="entry.version"
        class="flex min-h-12 items-center gap-3 rounded-md px-2 transition-colors hover:bg-muted"
      >
        <Avatar class="size-8 shrink-0">
          <AvatarFallback class="text-2xs font-medium">
            {{ actorInitial(entry) }}
          </AvatarFallback>
        </Avatar>

        <div class="min-w-0 flex-1">
          <p class="truncate text-sm text-foreground">
            <span class="text-muted-foreground">
              {{ getVersionAuthorshipLabel(index, entries.length) }}
            </span>
            <span class="font-medium"> {{ actorDisplayName(entry) }}</span>
          </p>
          <p class="text-xs text-muted-foreground">
            v{{ entry.displayVersion }} · {{ formatVersionTimestampLine(entry.createdAt) }}
            <span v-if="isCurrent(index)" class="text-primary"> · {{ t("pages.history.current") }}</span>
          </p>
        </div>

        <div
          v-if="hasRowActions(index)"
          class="flex shrink-0 items-center gap-1"
        >
              <Popover
                v-if="canRestore"
                :open="isPopoverOpen(entry.version)"
                @update:open="onPopoverOpenChange(entry.version, $event)"
              >
                <PopoverTrigger as-child>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    class="size-9"
                    :disabled="historyBusy"
                  >
                    <span :class="[studioIcons.refresh, 'size-3.5']" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent class="w-72 p-3" align="end">
                  <p class="text-sm font-medium text-foreground">
                    {{ t("pages.history.restoreTitle", { version: entry.displayVersion }) }}
                  </p>
                  <p class="text-2xs text-muted-foreground mt-1">
                    {{ t("pages.history.restoreDescription") }}
                  </p>
                  <div class="mt-3 flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      class="h-9"
                      :disabled="historyBusy"
                      @click="closePopover"
                    >
                      {{ t("pages.cancel") }}
                    </Button>
                    <Button
                      size="sm"
                      class="h-9"
                      :disabled="historyBusy"
                      @click="confirmRestore(entry.version)"
                    >
                      {{ isRestoring ? t("pages.history.restoring") : t("pages.history.restore") }}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>

              <TooltipProvider v-if="canDelete">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      class="size-9 text-destructive hover:text-destructive"
                      :disabled="historyBusy || !canDeleteEntry(index, entry.version)"
                      @click="emit('delete', entry.version)"
                    >
                      <span :class="[studioIcons.trash, 'size-3.5']" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent v-if="!canDeleteEntry(index, entry.version)">
                    {{ deleteDisabledReason(entry.version) }}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
        </div>
      </div>
    </div>
  </section>
</template>
