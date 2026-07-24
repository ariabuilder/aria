<script setup lang="ts">
import type { DateValue } from "@internationalized/date";
import { computed, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { studioIcons } from "@/lib/icons";
import {
  defaultScheduleFormState,
  getScheduleQuickPicks,
  getScheduleTimezoneHint,
  isoToScheduleFormState,
  isScheduleDateDisabled,
  maxScheduleCalendarDate,
  minScheduleCalendarDate,
  parseScheduleDateTime,
  validateScheduleTime,
  type ScheduleQuickPick,
} from "../composables/useSchedulePublish";
import { useStudioI18n } from "@/i18n";

interface Props {
  open?: boolean;
  initialIso?: string | null;
  confirmLabel?: string;
}

const props = withDefaults(defineProps<Props>(), {
  open: undefined,
  initialIso: null,
  confirmLabel: "",
});

const emit = defineEmits<{
  "update:open": [value: boolean];
  confirm: [iso: string];
  cancel: [];
}>();
const { t } = useStudioI18n();

const internalOpen = ref(false);
const selectedDate = ref<DateValue>(defaultScheduleFormState().date);
const selectedTime = ref(defaultScheduleFormState().time);
const validationError = ref<string | null>(null);

const isControlled = computed(() => props.open !== undefined);

watch(
  () => props.open,
  (value) => {
    if (value !== undefined) {
      internalOpen.value = value;
    }
  },
  { immediate: true },
);

watch(internalOpen, (value) => {
  if (isControlled.value) {
    emit("update:open", value);
  }
});

function setPopoverOpen(value: boolean): void {
  internalOpen.value = value;
}

const quickPicks = computed<ScheduleQuickPick[]>(() => getScheduleQuickPicks());
const timezoneHint = computed(() => getScheduleTimezoneHint());

const composedIso = computed(() =>
  parseScheduleDateTime(selectedDate.value, selectedTime.value),
);

function resetForm(iso?: string | null): void {
  const nextState =
    iso != null ? isoToScheduleFormState(iso) : defaultScheduleFormState();
  if (!nextState) {
    const fallback = defaultScheduleFormState();
    selectedDate.value = fallback.date;
    selectedTime.value = fallback.time;
    validationError.value = null;
    return;
  }

  selectedDate.value = nextState.date;
  selectedTime.value = nextState.time;
  validationError.value = null;
}

watch(
  () => internalOpen.value,
  (isOpen) => {
    if (!isOpen) return;
    resetForm(props.initialIso);
  },
);

watch(
  () => props.initialIso,
  (iso) => {
    if (!internalOpen.value) return;
    resetForm(iso);
  },
);

function applyQuickPick(pick: ScheduleQuickPick): void {
  const nextState = isoToScheduleFormState(pick.iso);
  if (!nextState) return;
  selectedDate.value = nextState.date;
  selectedTime.value = nextState.time;
  validationError.value = null;
}

function handleCancel(): void {
  setPopoverOpen(false);
  emit("cancel");
}

function handleConfirm(): void {
  const error = validateScheduleTime(composedIso.value);
  validationError.value = error;
  if (error) return;

  emit("confirm", composedIso.value);
  setPopoverOpen(false);
}
</script>

<template>
  <Popover v-model:open="internalOpen">
    <PopoverAnchor v-if="$slots.anchor" as-child>
      <slot name="anchor" />
    </PopoverAnchor>
    <PopoverTrigger v-else as-child>
      <slot />
    </PopoverTrigger>
    <PopoverContent
      side="top"
      align="end"
      :side-offset="8"
      class="z-[60] w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-lg border-border/80 bg-popover p-0 shadow-xl shadow-background/40"
    >
      <div class="space-y-4 p-4">
        <div class="flex items-start gap-3">
          <div
            class="flex size-9 shrink-0 items-center justify-center rounded-sm border border-primary/40 border-dashed bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <span :class="[studioIcons.schedule, 'size-4']" />
          </div>
          <div class="min-w-0 space-y-1">
            <p class="m-0 text-sm font-semibold text-foreground">
              {{ t("cms.publish.scheduleTitle") }}
            </p>
            <p class="m-0 text-xs leading-5 text-muted-foreground">
              {{ t("cms.publish.scheduleTimezone", { timezone: timezoneHint }) }}
            </p>
          </div>
        </div>

        <div
          class="rounded-lg border border-border/60 border-dashed bg-card/25 p-3"
        >
          <Calendar
            v-model="selectedDate"
            :min-value="minScheduleCalendarDate()"
            :max-value="maxScheduleCalendarDate()"
            :is-date-disabled="isScheduleDateDisabled"
          />
        </div>

        <div class="mx-auto grid w-full max-w-[17.5rem] gap-1.5">
          <Label
            for="schedule-time"
            class="text-xs font-medium text-muted-foreground"
          >
            {{ t("cms.publish.time") }}
          </Label>
          <Input
            id="schedule-time"
            v-model="selectedTime"
            type="time"
            class="h-10 rounded-sm border-dashed bg-background/60 px-3 text-sm font-medium"
          />
        </div>

        <div
          v-if="quickPicks.length > 0"
          class="mx-auto flex w-full max-w-[17.5rem] flex-wrap gap-1.5"
        >
          <Button
            v-for="pick in quickPicks"
            :key="pick.id"
            type="button"
            variant="outline"
            size="xs"
            class="h-8 rounded-sm border-dashed bg-background/30 px-2.5 text-xs text-muted-foreground hover:bg-primary/10 hover:text-foreground"
            @click="applyQuickPick(pick)"
          >
            {{ pick.label }}
          </Button>
        </div>

        <p
          v-if="validationError"
          class="mx-auto max-w-[17.5rem] text-xs text-destructive"
        >
          {{ validationError }}
        </p>
      </div>

      <Separator />

      <div class="flex items-center justify-end gap-2 bg-background/30 p-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          class="h-9 rounded-sm border-dashed px-4"
          @click="handleCancel"
        >
          {{ t("common.cancel") }}
        </Button>
        <Button
          type="button"
          size="sm"
          class="h-9 rounded-sm px-4"
          @click="handleConfirm"
        >
          {{ confirmLabel || t("cms.publish.schedule") }}
        </Button>
      </div>
    </PopoverContent>
  </Popover>
</template>
