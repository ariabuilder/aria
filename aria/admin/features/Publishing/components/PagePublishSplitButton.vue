<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { studioIcons } from "@/lib/icons";
import { formatScheduleDisplay } from "../composables/useSchedulePublish";
import { useStudioI18n } from "@/i18n";

export type PagePublishStatus =
  | "draft"
  | "published"
  | "scheduled"
  | "archived";

const props = withDefaults(
  defineProps<{
    status: PagePublishStatus;
    canPublish?: boolean;
    isBusy?: boolean;
    scheduledFor?: string | null;
    publishDisabledReason?: string | null;
    isModifiedSincePublish?: boolean;
  }>(),
  {
    canPublish: false,
    isBusy: false,
    scheduledFor: null,
    publishDisabledReason: null,
    isModifiedSincePublish: false,
  },
);

const emit = defineEmits<{
  publishNow: [];
}>();
const { t } = useStudioI18n();

const isPublished = computed(() => props.status === "published");
const isScheduled = computed(() => props.status === "scheduled");
const isArchived = computed(() => props.status === "archived");
const isDraft = computed(() => props.status === "draft");

const mainActionEnabled = computed(
  () =>
    ((isDraft.value || isArchived.value) &&
      props.canPublish &&
      !props.isBusy &&
      !props.publishDisabledReason) ||
    (isPublished.value &&
      props.isModifiedSincePublish &&
      props.canPublish &&
      !props.isBusy &&
      !props.publishDisabledReason),
);

const showPublishedIdle = computed(
  () => isPublished.value && !props.isModifiedSincePublish,
);

const mainButtonLabel = computed(() => {
  if (props.isBusy && (isDraft.value || isArchived.value)) {
    return t("pages.action.publishing");
  }
  if (isPublished.value && props.isModifiedSincePublish) {
    return props.isBusy ? t("pages.action.publishing") : t("pages.detail.publishChanges");
  }
  if (isPublished.value) return t("pages.status.published");
  if (isScheduled.value) {
    return props.scheduledFor
      ? formatScheduleDisplay(props.scheduledFor)
      : t("pages.status.scheduled");
  }
  return t("pages.action.publish");
});

const mainButtonVariant = computed(() =>
  mainActionEnabled.value ? "default" : "secondary",
);

const mainButtonClass = computed(() =>
  cn("h-9", showPublishedIdle.value && "opacity-60"),
);

function handleMainClick(): void {
  if (!mainActionEnabled.value) return;
  emit("publishNow");
}
</script>

<template>
  <Button
    type="button"
    :variant="mainButtonVariant"
    size="default"
    :class="mainButtonClass"
    :disabled="!mainActionEnabled"
    :title="
      publishDisabledReason && (isDraft || isArchived)
        ? publishDisabledReason
        : undefined
    "
    @click="handleMainClick"
  >
    <span
      v-if="
        isBusy &&
        (isDraft ||
          isArchived ||
          (isPublished && isModifiedSincePublish))
      "
      :class="[studioIcons.loading, 'size-4 animate-spin']"
    />
    {{ mainButtonLabel }}
  </Button>
</template>
