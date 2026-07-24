<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import HeaderActionDropdownTooltip from "@/features/Studio/core/components/HeaderActionDropdownTooltip.vue";
import PageMenuSectionLabel from "@/features/Studio/pages/components/PageMenuSectionLabel.vue";
import { studioIcons } from "@/lib/icons";
import type { EntryStatus } from "../../../../lib/cms/constants";
import SchedulePublishPopover from "./SchedulePublishPopover.vue";
import { useStudioI18n } from "@/i18n";

const props = withDefaults(
  defineProps<{
    status: EntryStatus;
    canSchedule?: boolean;
    canUnpublish?: boolean;
    canArchive?: boolean;
    canDelete?: boolean;
    isBusy?: boolean;
    isDeleting?: boolean;
    scheduledFor?: string | null;
    publishDisabledReason?: string | null;
    unpublishForbiddenMessage?: string;
    archiveForbiddenMessage?: string;
    deleteForbiddenMessage?: string;
    scheduleForbiddenMessage?: string;
  }>(),
  {
    canSchedule: false,
    canUnpublish: false,
    canArchive: false,
    canDelete: false,
    isBusy: false,
    isDeleting: false,
    scheduledFor: null,
    publishDisabledReason: null,
    unpublishForbiddenMessage: "",
    archiveForbiddenMessage: "",
    deleteForbiddenMessage: "",
    scheduleForbiddenMessage: "",
  },
);

const emit = defineEmits<{
  schedule: [iso: string];
  reschedule: [iso: string];
  cancelSchedule: [];
  unpublish: [];
  archive: [];
  delete: [];
}>();
const { t } = useStudioI18n();

const isDropdownOpen = ref(false);
const isSchedulePopoverOpen = ref(false);
const schedulePopoverMode = ref<"schedule" | "reschedule">("schedule");
let scheduleOpenFrame = 0;
let scheduleOpenTimer: ReturnType<typeof window.setTimeout> | null = null;

const isPublished = computed(() => props.status === "published");
const isScheduled = computed(() => props.status === "scheduled");
const isArchived = computed(() => props.status === "archived");
const isDraft = computed(() => props.status === "draft");

const dropdownDisabled = computed(
  () => props.isBusy || props.isDeleting,
);

const scheduleDisabled = computed(
  () =>
    props.isBusy ||
    !props.canSchedule ||
    Boolean(props.publishDisabledReason),
);

const schedulePopoverInitialIso = computed(() =>
  schedulePopoverMode.value === "reschedule" ? props.scheduledFor : null,
);

const schedulePopoverConfirmLabel = computed(() =>
  schedulePopoverMode.value === "reschedule"
    ? t("cms.publish.update")
    : t("cms.publish.schedule"),
);

function openSchedulePopoverAfterDropdownClose(): void {
  isDropdownOpen.value = false;
  isSchedulePopoverOpen.value = false;

  if (scheduleOpenTimer) {
    window.clearTimeout(scheduleOpenTimer);
  }
  if (scheduleOpenFrame) {
    cancelAnimationFrame(scheduleOpenFrame);
  }
  scheduleOpenTimer = window.setTimeout(() => {
    scheduleOpenTimer = null;
    scheduleOpenFrame = requestAnimationFrame(() => {
      scheduleOpenFrame = 0;
      isSchedulePopoverOpen.value = true;
    });
  }, 0);
}

function openSchedulePopover(): void {
  if (scheduleDisabled.value) return;
  schedulePopoverMode.value = "schedule";
  openSchedulePopoverAfterDropdownClose();
}

function openReschedulePopover(): void {
  if (scheduleDisabled.value) return;
  schedulePopoverMode.value = "reschedule";
  openSchedulePopoverAfterDropdownClose();
}

function handleSchedulePopoverConfirm(iso: string): void {
  if (schedulePopoverMode.value === "reschedule") {
    emit("reschedule", iso);
    return;
  }
  emit("schedule", iso);
}

onBeforeUnmount(() => {
  if (scheduleOpenTimer) {
    window.clearTimeout(scheduleOpenTimer);
  }
  if (scheduleOpenFrame) {
    cancelAnimationFrame(scheduleOpenFrame);
  }
});
</script>

<template>
  <SchedulePublishPopover
    v-model:open="isSchedulePopoverOpen"
    :initial-iso="schedulePopoverInitialIso"
    :confirm-label="schedulePopoverConfirmLabel"
    @confirm="handleSchedulePopoverConfirm"
  >
    <template #anchor>
      <HeaderActionDropdownTooltip :label="t('cms.publish.moreActions')">
        <DropdownMenu v-model:open="isDropdownOpen">
          <DropdownMenuTrigger as-child>
            <Button
              type="button"
              variant="headerAction"
              size="icon-header"
              :disabled="dropdownDisabled"
              :aria-label="t('cms.publish.options')"
            >
              <span
                :class="[studioIcons.moreHorizontal, 'size-3.5 shrink-0']"
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            class="w-48 [&_[data-slot=dropdown-menu-item]:has(+[role=presentation])]:border-b-0"
          >
            <PageMenuSectionLabel first>{{ t("cms.publish.status") }}</PageMenuSectionLabel>

            <DropdownMenuItem
              v-if="(isDraft || isArchived) && canSchedule"
              :disabled="scheduleDisabled"
              :title="scheduleForbiddenMessage || undefined"
              @click="openSchedulePopover"
            >
              <span
                :class="[studioIcons.calendar, 'mr-2 size-3.5 shrink-0']"
              />
              {{ t("cms.publish.schedule") }}
            </DropdownMenuItem>

            <template v-else-if="isScheduled">
              <DropdownMenuItem
                :disabled="scheduleDisabled"
                @click="openReschedulePopover"
              >
                <span
                  :class="[studioIcons.calendar, 'mr-2 size-3.5 shrink-0']"
                />
                {{ t("cms.publish.reschedule") }}
              </DropdownMenuItem>
              <DropdownMenuItem
                :disabled="isBusy || !canSchedule"
                @click="emit('cancelSchedule')"
              >
                <span
                  :class="[studioIcons.close, 'mr-2 size-3.5 shrink-0']"
                />
                {{ t("cms.publish.cancelSchedule") }}
              </DropdownMenuItem>
            </template>

            <DropdownMenuItem
              v-else-if="isPublished"
              :disabled="isBusy || !canUnpublish"
              :title="unpublishForbiddenMessage || undefined"
              @click="emit('unpublish')"
            >
              <span :class="[studioIcons.eyeOff, 'mr-2 size-3.5 shrink-0']" />
              {{ isBusy ? t("cms.unpublishing") : t("cms.unpublish") }}
            </DropdownMenuItem>

            <DropdownMenuItem
              :disabled="isBusy || !canArchive"
              :title="archiveForbiddenMessage || undefined"
              @click="emit('archive')"
            >
              <span
                :class="[
                  isArchived ? studioIcons.refresh : studioIcons.archived,
                  'mr-2 size-3.5 shrink-0',
                ]"
              />
              {{ isArchived ? t("cms.publish.unarchive") : t("cms.archive") }}
            </DropdownMenuItem>

            <template v-if="canDelete">
              <PageMenuSectionLabel compact>{{ t("cms.publish.remove") }}</PageMenuSectionLabel>

              <DropdownMenuItem
                variant="destructive"
                :disabled="isBusy || isDeleting || !canDelete"
                :title="deleteForbiddenMessage || undefined"
                @click="emit('delete')"
              >
                <span :class="[studioIcons.trash, 'mr-2 size-3.5 shrink-0']" />
                {{ t("common.delete") }}
              </DropdownMenuItem>
            </template>
          </DropdownMenuContent>
        </DropdownMenu>
      </HeaderActionDropdownTooltip>
    </template>
  </SchedulePublishPopover>
</template>
