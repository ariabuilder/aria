<script setup lang="ts">
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useStudioI18n } from "@/i18n";

defineProps<{
  open: boolean;
  isRestoring: boolean;
}>();
const { t } = useStudioI18n();

const emit = defineEmits<{
  "update:open": [value: boolean];
  confirm: [];
}>();
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[440px]">
      <DialogHeader class="gap-0">
        <DialogTitle>{{ t("cms.entry.restore.title") }}</DialogTitle>
        <DialogDescription>
          {{ t("cms.entry.restore.description") }}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button
          variant="outline"
          size="sm"
          class="h-9!"
          :disabled="isRestoring"
          @click="emit('update:open', false)"
        >
          {{ t("common.cancel") }}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          class="h-9!"
          :disabled="isRestoring"
          @click="emit('confirm')"
        >
          {{ isRestoring ? t("cms.entry.restore.restoring") : t("cms.entry.restore.confirm") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
