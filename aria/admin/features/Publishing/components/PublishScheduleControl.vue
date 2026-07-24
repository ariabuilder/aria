<script setup lang="ts">
import { computed, ref } from "vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { studioIcons } from "@/lib/icons";
import type { EntryStatus } from "../../../../lib/cms/constants";
import { formatScheduleDisplay } from "../composables/useSchedulePublish";
import SchedulePublishPopover from "./SchedulePublishPopover.vue";
import { useStudioI18n } from "@/i18n";

interface Props {
  canPublish?: boolean;
  canSchedule?: boolean;
  isBusy?: boolean;
  status: EntryStatus;
  scheduledFor?: string | null;
  disabledReason?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  canPublish: false,
  canSchedule: false,
  isBusy: false,
  scheduledFor: null,
  disabledReason: null,
});

const emit = defineEmits<{
  publishNow: [];
  schedule: [iso: string];
  cancelSchedule: [];
  reschedule: [iso: string];
}>();
const { t } = useStudioI18n();

const isRescheduleOpen = ref(false);

const isScheduled = computed(() => props.status === "scheduled");
const showPublishControls = computed(() => props.status !== "scheduled");
const publishDisabled = computed(
  () =>
    props.isBusy ||
    !props.canPublish ||
    Boolean(props.disabledReason),
);
const scheduleDisabled = computed(
  () =>
    props.isBusy ||
    !props.canSchedule ||
    Boolean(props.disabledReason),
);
const disabledTooltip = computed(
  () => props.disabledReason ?? undefined,
);
const scheduledLabel = computed(() =>
  props.scheduledFor
    ? formatScheduleDisplay(props.scheduledFor)
    : t("cms.entry.status.scheduled"),
);

function handlePublishNow(): void {
  if (publishDisabled.value) return;
  emit("publishNow");
}

function handleSchedule(iso: string): void {
  emit("schedule", iso);
}

function handleReschedule(iso: string): void {
  emit("reschedule", iso);
}

function handleCancelSchedule(): void {
  emit("cancelSchedule");
}
</script>

<template>
  <TooltipProvider>
    <div class="grid gap-2">
      <div
        v-if="showPublishControls"
        class="grid gap-2"
      >
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              type="button"
              class="h-9 w-full"
              :disabled="publishDisabled"
              @click="handlePublishNow"
            >
              <span :class="[studioIcons.publish, 'size-4']" />
              {{ isBusy ? t("cms.publish.publishing") : t("cms.publish.publishNow") }}
            </Button>
          </TooltipTrigger>
          <TooltipContent v-if="disabledTooltip">
            {{ disabledTooltip }}
          </TooltipContent>
        </Tooltip>

        <SchedulePublishPopover v-if="canSchedule" @confirm="handleSchedule">
          <Button
            type="button"
            variant="outline"
            class="h-9 w-full border-dashed"
            :disabled="scheduleDisabled"
            :title="
              disabledTooltip ??
              t('cms.publish.scheduleHint')
            "
          >
            <span :class="[studioIcons.calendar, 'size-4']" />
            {{ t("cms.publish.schedule") }}
          </Button>
        </SchedulePublishPopover>
      </div>

      <div
        v-else-if="isScheduled"
        class="grid gap-2 rounded-md border border-border/50 border-dashed bg-card/20 p-2.5"
      >
        <div class="flex items-center justify-between gap-2">
          <Badge variant="outline" size="sm" class="border-dashed">
            <span :class="[studioIcons.scheduled, 'size-3.5']" />
            {{ scheduledLabel }}
          </Badge>
        </div>
        <div class="flex items-center gap-3 text-xs">
          <SchedulePublishPopover
            v-model:open="isRescheduleOpen"
            :initial-iso="scheduledFor"
            :confirm-label="t('cms.publish.update')"
            @confirm="handleReschedule"
          >
            <button
              type="button"
              class="text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-50"
              :disabled="scheduleDisabled"
            >
              {{ t("cms.publish.edit") }}
            </button>
          </SchedulePublishPopover>
          <button
            type="button"
            class="text-muted-foreground underline-offset-4 transition-colors hover:text-destructive hover:underline disabled:pointer-events-none disabled:opacity-50"
            :disabled="isBusy || !canSchedule"
            @click="handleCancelSchedule"
          >
            {{ t("common.cancel") }}
          </button>
        </div>
      </div>

    </div>
  </TooltipProvider>
</template>
