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

const { t } = useStudioI18n();

defineProps<{
  open: boolean;
  templateName?: string;
  previewRows?: string[][];
  isApplying?: boolean;
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
      class="sm:max-w-lg p-0 gap-0 overflow-hidden [&>button]:top-4 [&>button]:right-5"
    >
      <DialogHeader class="gap-0">
        <DialogTitle class="text-xl font-serif font-medium text-foreground m-0">
          {{ t("design.colors.applyDialog.title") }}
        </DialogTitle>
        <DialogDescription class="text-sm text-muted-foreground mt-1.5 m-0">
          {{ t("design.colors.applyDialog.description") }}
        </DialogDescription>
      </DialogHeader>

      <div class="py-0">
        <div
          v-if="previewRows?.length"
          class="mb-5 space-y-2 rounded-sm border border-solid border-border bg-sidebar/30 p-3"
        >
          <div class="flex items-center justify-between gap-3">
            <span class="truncate text-sm font-medium text-foreground">
              {{ templateName }}
            </span>
            <span class="text-xs text-muted-foreground">
              {{ t("design.colors.templatePreview") }}
            </span>
          </div>
          <div
            class="grid gap-px overflow-hidden rounded-[3px] border border-solid border-black/5 dark:border-white/8"
            aria-hidden="true"
          >
            <div
              v-for="(row, rowIndex) in previewRows"
              :key="rowIndex"
              class="flex h-2"
            >
              <span
                v-for="(color, colorIndex) in row"
                :key="colorIndex"
                class="min-w-0 flex-1"
                :style="{ backgroundColor: color }"
              />
            </div>
          </div>
        </div>

        <p class="text-sm leading-relaxed text-foreground/90 text-balance">
          {{ t("design.colors.applyDialog.applying") }}
          <span class="font-semibold text-foreground">
            {{ templateName || t("design.colors.applyDialog.thisTemplate") }}
          </span>
          {{ t("design.colors.applyDialog.replaceDefaults") }}
        </p>
        <p class="text-sm leading-relaxed text-muted-foreground mt-5 text-balance">
          {{ t("design.colors.applyDialog.historyRecorded") }}
        </p>
      </div>

      <DialogFooter
        class="py-4 flex items-center justify-between"
      >
        <Button
          variant="outline"
          class="h-9!"
          size="sm"
          :disabled="isApplying"
          @click="handleOpenChange(false)"
        >
          {{ t("common.cancel") }}
        </Button>
        <Button
          variant="destructive"
          class="h-9!"
          size="sm"
          :disabled="isApplying"
          @click="handleConfirm"
        >
          {{ isApplying ? t("design.colors.applying") : t("design.colors.applyDialog.applyTemplate") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
