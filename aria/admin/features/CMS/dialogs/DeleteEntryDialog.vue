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

interface Props {
  open: boolean;
  title: string;
  isDeleting: boolean;
  count?: number;
}

defineProps<Props>();
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
        <DialogTitle>{{ t("cms.entry.delete.title") }}</DialogTitle>
        <DialogDescription>
          <template v-if="count && count > 1">
            {{ t("cms.entry.delete.manyDescription", { count }) }}
          </template>
          <template v-else>
            {{ t("cms.entry.delete.oneDescription", { title }) }}
          </template>
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button
          variant="outline"
          size="sm"
          class="h-9!"
          :disabled="isDeleting"
          @click="emit('update:open', false)"
        >
          {{ t("common.cancel") }}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          class="h-9!"
          :disabled="isDeleting"
          @click="emit('confirm')"
        >
          {{
            isDeleting
              ? t("common.deleting")
              : count && count > 1
                ? t("cms.entry.delete.manyConfirm")
                : t("cms.entry.delete.oneConfirm")
          }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
