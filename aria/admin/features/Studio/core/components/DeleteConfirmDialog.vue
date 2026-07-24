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
import { computed } from "vue";
import { useStudioI18n } from "@/i18n";

interface Props {
  open: boolean;
  title?: string;
  description?: string;
  itemName?: string;
  isLoading?: boolean;
  confirmLabel?: string;
}

const props = withDefaults(defineProps<Props>(), {
  itemName: "",
  isLoading: false,
});
const { t } = useStudioI18n();
const dialogTitle = computed(() => props.title ?? t("common.deleteConfirmTitle"));
const dialogDescription = computed(
  () => props.description ?? t("common.deleteConfirmDescription"),
);
const dialogConfirmLabel = computed(() => props.confirmLabel ?? t("common.delete"));

const emit = defineEmits<{
  "update:open": [value: boolean];
  confirm: [];
}>();
</script>

<template>
  <Dialog :open="open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>{{ dialogTitle }}</DialogTitle>
        <DialogDescription>{{ dialogDescription }}</DialogDescription>
      </DialogHeader>
      <div v-if="itemName" class="py-2">
        <p class="text-sm font-medium text-foreground">"{{ itemName }}"</p>
      </div>
      <DialogFooter>
        <Button
          variant="outline"
          size="sm"
          :disabled="isLoading"
          @click="emit('update:open', false)"
        >
          {{ t("common.cancel") }}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          :disabled="isLoading"
          @click="emit('confirm')"
        >
          {{ isLoading ? t("common.deleting") : dialogConfirmLabel }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
