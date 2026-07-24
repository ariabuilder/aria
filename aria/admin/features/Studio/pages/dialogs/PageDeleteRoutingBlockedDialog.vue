<script setup lang="ts">
import { computed } from "vue";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatPageCmsRoutingDeleteMessage } from "../../../../../lib/pages/cmsTemplatePolicy";
import type { PageCmsRoutingImpact } from "../../../../../lib/pages/cmsTemplatePolicy";
import { useStudioI18n } from "@/i18n";

const props = defineProps<{
  open: boolean;
  pageLabel?: string;
  impact: PageCmsRoutingImpact | null;
  canUnbind: boolean;
  isLoading?: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  cancel: [];
  "unbind-and-delete": [];
}>();
const { t } = useStudioI18n();

const message = computed(() =>
  props.impact ? formatPageCmsRoutingDeleteMessage(props.impact) : "",
);

const description = computed(() => {
  const label = props.pageLabel?.trim();
  if (!label) {
    return message.value;
  }

  return t("pages.assignedCollectionDescription", {
    message: message.value,
    page: label,
  });
});

function closeDialog() {
  emit("update:open", false);
  emit("cancel");
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle>{{ t("pages.assignedCollectionTitle") }}</DialogTitle>
        <DialogDescription>{{ description }}</DialogDescription>
      </DialogHeader>

      <p
        v-if="!canUnbind"
        class="text-sm text-muted-foreground"
      >
        {{ t("pages.assignedCollectionNoPermission") }}
      </p>

      <DialogFooter class="gap-3 sm:gap-3">
        <Button
          variant="outline"
          size="sm"
          :disabled="isLoading"
          @click="closeDialog"
        >
          {{ t("pages.cancel") }}
        </Button>
        <Button
          v-if="canUnbind"
          variant="destructive"
          size="sm"
          :disabled="isLoading"
          @click="emit('unbind-and-delete')"
        >
          {{ isLoading ? t("pages.unbinding") : t("pages.unbindAndDelete") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
