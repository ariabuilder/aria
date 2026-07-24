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

import type { StudioPageDialogTarget } from "../../types";
import { useStudioI18n } from "@/i18n";

const props = defineProps<{
  open: boolean;
  page: StudioPageDialogTarget | null;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  confirm: [];
}>();

const { t } = useStudioI18n();
const pageLabel = computed(
  () => props.page?.title || props.page?.id || t("pages.thisPage"),
);

function closeDialog() {
  emit("update:open", false);
}
</script>

<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="" @escape-key-down="closeDialog">
      <div class="px-4 py-1 bg-background rounded-md">
        <DialogHeader>
          <DialogTitle>{{ t("pages.deleteTitle") }}</DialogTitle>
          <DialogDescription>
            {{ t("pages.deleteThisPage", { page: pageLabel }) }}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter class="gap-3 sm:gap-3 pb-4">
          <Button variant="outline" size="sm" @click="closeDialog">
            {{ t("pages.cancel") }}
          </Button>
          <Button variant="destructive" size="sm" @click="$emit('confirm')">
            {{ t("common.delete") }}
          </Button>
        </DialogFooter>
      </div>
    </DialogContent>
  </Dialog>
</template>
