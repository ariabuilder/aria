<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { useStudioI18n } from "@/i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const { t } = useStudioI18n();

defineProps<{
  open: boolean;
  isConfirming?: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  confirm: [];
}>();

function handleOpenChange(value: boolean): void {
  emit("update:open", value);
}

function handleConfirm(): void {
  emit("confirm");
}
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent
      class="w-[44svw]! max-w-2xl! max-h-[72dvh]! p-0 gap-0 overflow-hidden [&>button]:top-5 [&>button]:right-6"
    >
      <div
        class="w-full h-full flex flex-col bg-background rounded-lg border border-border"
      >
        <div class="px-7 pt-5 pb-5 border-b border-border shrink-0">
          <DialogHeader class="space-y-0 mt-2 mb-6">
            <DialogTitle
              class="m-0 p-0 text-3xl font-serif font-regular text-foreground"
            >
              {{ t("design.variables.resetDialog.title") }}
            </DialogTitle>
            <DialogDescription
              class="text-sm text-muted-foreground leading-0 relative top-2"
            >
              {{ t("design.variables.resetDialog.description") }}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div class="flex-1 overflow-auto p-7 grid gap-4 bg-sidebar/10">
          <p class="text-sm leading-6 text-foreground/90">
            {{ t("design.variables.resetDialog.inventoryOnly") }}
          </p>
          <p class="text-sm leading-6 text-muted-foreground">
            {{ t("design.variables.resetDialog.history") }}
          </p>
        </div>

        <DialogFooter
          class="px-7 py-4 border-t border-border border-dashed shrink-0 flex items-center justify-between bg-background"
        >
          <Button
            variant="outline"
            class="text-muted-foreground hover:text-foreground px-4 h-10 font-medium"
            :disabled="isConfirming"
            @click="handleOpenChange(false)"
          >
            {{ t("common.cancel") }}
          </Button>
          <Button
            variant="destructive"
            class="h-10 px-8 font-medium"
            :disabled="isConfirming"
            @click="handleConfirm"
          >
            {{ isConfirming ? t("design.variables.resetDialog.resetting") : t("design.variables.resetDialog.confirm") }}
          </Button>
        </DialogFooter>
      </div>
    </DialogContent>
  </Dialog>
</template>
